import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Article, DomainMember, DomainRole, Prisma, TopicStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { slugify } from '../common/slug'
import { parse, render, countWords } from '../markdown'
import { CreateArticleInput, UpdateArticleInput } from './article.types'
import { PageInput } from '../common/dto/page.input'

interface RenderedContent {
  renderedHtml: string
  wordCount: number
}

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, domainId: string, input: CreateArticleInput): Promise<Article> {
    await this.requireMember(userId, domainId)
    const { renderedHtml, wordCount } = this.renderContent(input.content)

    return this.prisma.$transaction(async (tx) => {
      let topicId: string | undefined
      if (input.topicId) {
        const topic = await tx.topic.findFirst({ where: { id: input.topicId, domainId } })
        // Même politique NOT_FOUND que pour un domaine/sujet inaccessible :
        // un sujet d'un autre domaine ne doit pas être distinguable d'un
        // sujet inexistant.
        if (!topic) throw new NotFoundException('Sujet introuvable')

        const existingArticle = await tx.article.findUnique({ where: { topicId: input.topicId } })
        if (existingArticle) throw new ConflictException('Ce sujet a déjà été converti en article')

        // Le passage à CONVERTED a lieu AVANT la création de l'article, dans
        // la même transaction interactive : si `article.create` échoue
        // ensuite (ex. `categoryId` inexistant -> violation de contrainte de
        // clé étrangère), Postgres annule aussi cette mise à jour. C'est ce
        // qui rend l'atomicité vérifiable : un test peut forcer l'échec de
        // l'étape suivante et constater que le sujet est resté intact.
        await tx.topic.update({ where: { id: topic.id }, data: { status: TopicStatus.CONVERTED } })
        topicId = topic.id
      }

      const slug = await this.uniqueSlug(slugify(input.title), domainId, tx)

      return tx.article.create({
        data: {
          domainId,
          authorId: userId,
          topicId,
          categoryId: input.categoryId,
          title: input.title,
          slug,
          content: input.content,
          renderedHtml,
          wordCount,
          excerpt: input.excerpt,
          coverImageUrl: input.coverImageUrl,
          seoTitle: input.seoTitle,
          metaDescription: input.metaDescription,
          canonicalUrl: input.canonicalUrl,
          focusKeyword: input.focusKeyword,
          secondaryKeywords: input.secondaryKeywords,
          robotsIndex: input.robotsIndex,
          robotsFollow: input.robotsFollow,
        },
      })
    })
  }

  /** Ne retourne que les articles du domaine dont l'utilisateur est membre. */
  async listForDomain(
    userId: string,
    domainId: string,
    page: PageInput,
  ): Promise<{ items: Article[]; totalCount: number }> {
    await this.requireMember(userId, domainId)
    const where: Prisma.ArticleWhereInput = { domainId }
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.article.findMany({ where, orderBy: { createdAt: 'desc' }, take: page.limit, skip: page.offset }),
      this.prisma.article.count({ where }),
    ])
    return { items, totalCount }
  }

  async findForUser(userId: string, domainId: string, articleId: string): Promise<Article> {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, domainId, domain: { members: { some: { userId } } } },
    })
    if (!article) throw new NotFoundException('Article introuvable')
    return article
  }

  async update(userId: string, domainId: string, articleId: string, input: UpdateArticleInput): Promise<Article> {
    const member = await this.requireMember(userId, domainId)
    const article = await this.findForUser(userId, domainId, articleId)

    // Défense en profondeur, indépendante du guard : un AUTHOR ne modifie
    // que ses propres articles ; EDITOR et OWNER (rangs supérieurs) peuvent
    // modifier n'importe quel article du domaine.
    if (member.role === DomainRole.AUTHOR && article.authorId !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres articles')
    }

    const data: Prisma.ArticleUpdateInput = { ...input }
    // Valeurs dérivées : recalculées à chaque écriture du contenu, jamais
    // conservées telles quelles. Un contenu inchangé (`content` omis) laisse
    // `renderedHtml`/`wordCount` intacts plutôt que de les effacer.
    if (input.content !== undefined) {
      const { renderedHtml, wordCount } = this.renderContent(input.content)
      data.renderedHtml = renderedHtml
      data.wordCount = wordCount
    }

    return this.prisma.article.update({ where: { id: articleId }, data })
  }

  async remove(userId: string, domainId: string, articleId: string): Promise<boolean> {
    const member = await this.requireMember(userId, domainId)
    if (member.role !== DomainRole.OWNER) {
      throw new ForbiddenException('Seul un OWNER peut supprimer un article')
    }
    await this.findForUser(userId, domainId, articleId)
    await this.prisma.article.delete({ where: { id: articleId } })
    return true
  }

  private renderContent(content: string): RenderedContent {
    const ast = parse(content)
    return { renderedHtml: render(ast), wordCount: countWords(ast) }
  }

  private async uniqueSlug(base: string, domainId: string, tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? base : `${base}-${i}`
      const existing = await tx.article.findUnique({ where: { domainId_slug: { domainId, slug: candidate } } })
      if (!existing) return candidate
    }
  }

  /**
   * Vérifie l'appartenance au domaine indépendamment du guard : un appel
   * depuis un autre chemin ne doit pas pouvoir contourner l'isolation par
   * domaine simplement en sautant le resolver.
   */
  private async requireMember(userId: string, domainId: string): Promise<DomainMember> {
    const member = await this.prisma.domainMember.findUnique({
      where: { userId_domainId: { userId, domainId } },
    })
    if (!member) throw new NotFoundException('Domaine introuvable')
    return member
  }
}
