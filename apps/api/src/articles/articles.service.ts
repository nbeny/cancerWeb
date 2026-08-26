import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Article, ArticleStatus, ArticleVersion, DomainMember, DomainRole, Prisma, TopicStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { slugify } from '../common/slug'
import { parse, render, countWords } from '../markdown'
import { CreateArticleInput, UpdateArticleInput } from './article.types'
import { PageInput } from '../common/dto/page.input'
import { VersionsService } from './versions.service'
import { canTransition } from './transitions'

interface RenderedContent {
  renderedHtml: string
  wordCount: number
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: VersionsService,
  ) {}

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

      const article = await tx.article.create({
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

      // v1 : instantané initial, dans la même transaction que la création.
      await this.versions.snapshot(tx, article.id, userId, article.title, article.content)

      return article
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

  // ---------------------------------------------------------------------
  // Transitions (Task 8) — s'appuient sur la machine à états pure de
  // `transitions.ts` (Task 7). `findForUser` refiltre déjà sur le domaine
  // RÉEL de l'article (voir sa jsdoc) : un `domainId` transmis qui ne
  // correspond pas au domaine effectif de l'article échoue à cette étape,
  // avant même d'atteindre `canTransition`.
  // ---------------------------------------------------------------------

  /**
   * Effectue une transition de statut et l'instantané de version qui
   * l'accompagne dans UNE SEULE transaction : un statut avancé sans
   * instantané correspondant rendrait une restauration ultérieure
   * incohérente. `mutateData` peut renvoyer des champs additionnels
   * (`publishedAt`, `scheduledAt`, ...) et peut lever une erreur (ex. date
   * de programmation passée) — dans ce cas la transaction n'a pas encore
   * commencé, rien n'est écrit.
   */
  private async transitionArticle(
    userId: string,
    domainId: string,
    articleId: string,
    to: ArticleStatus,
    action: string,
    mutateData?: (article: Article) => Prisma.ArticleUpdateInput,
  ): Promise<Article> {
    const member = await this.requireMember(userId, domainId)
    const article = await this.findForUser(userId, domainId, articleId)

    const check = canTransition(article.status, to, member.role)
    // FORBIDDEN, jamais NOT_FOUND : l'article est visible de l'utilisateur,
    // seule l'action demandée lui est refusée (transition inexistante depuis
    // ce statut, ou rôle insuffisant pour celle-ci).
    if (!check.allowed) throw new ForbiddenException(check.reason)

    const extra = mutateData?.(article) ?? {}

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({ where: { id: articleId }, data: { status: to, ...extra } })
      const snapshot = await this.versions.snapshot(tx, articleId, userId, updated.title, updated.content, action)
      // `versions.snapshot` a mis à jour `currentVersion` en base après cette
      // lecture : on la reflète ici sans relire, plutôt que de renvoyer une
      // valeur périmée.
      return { ...updated, currentVersion: snapshot.version }
    })
  }

  submitForReview(userId: string, domainId: string, articleId: string): Promise<Article> {
    return this.transitionArticle(userId, domainId, articleId, ArticleStatus.REVIEW, 'submit')
  }

  rejectArticle(userId: string, domainId: string, articleId: string): Promise<Article> {
    return this.transitionArticle(userId, domainId, articleId, ArticleStatus.DRAFT, 'reject')
  }

  approveArticle(userId: string, domainId: string, articleId: string): Promise<Article> {
    return this.transitionArticle(userId, domainId, articleId, ArticleStatus.APPROVED, 'approve')
  }

  publishArticle(userId: string, domainId: string, articleId: string): Promise<Article> {
    // Ne positionne QUE `publishedAt`. Aucun mécanisme de publication
    // programmée effective ici : le worker qui publiera les articles échus
    // (via `scheduledAt`) appartient au Lot 3.
    return this.transitionArticle(userId, domainId, articleId, ArticleStatus.PUBLISHED, 'publish', () => ({
      publishedAt: new Date(),
    }))
  }

  scheduleArticle(userId: string, domainId: string, articleId: string, scheduledAt: Date): Promise<Article> {
    // Ne positionne QUE `scheduledAt`, jamais `publishedAt` : la publication
    // effective à l'échéance est du ressort d'un worker (Lot 3), pas de
    // cette mutation.
    return this.transitionArticle(userId, domainId, articleId, ArticleStatus.SCHEDULED, 'schedule', () => {
      if (scheduledAt.getTime() <= Date.now()) {
        throw new BadRequestException('La date de programmation doit être dans le futur')
      }
      return { scheduledAt }
    })
  }

  archiveArticle(userId: string, domainId: string, articleId: string): Promise<Article> {
    return this.transitionArticle(userId, domainId, articleId, ArticleStatus.ARCHIVED, 'archive')
  }

  // ---------------------------------------------------------------------
  // Versions (Task 8)
  // ---------------------------------------------------------------------

  async listVersions(userId: string, domainId: string, articleId: string): Promise<ArticleVersion[]> {
    await this.findForUser(userId, domainId, articleId) // vérifie membership + domaine réel de l'article
    return this.versions.listForArticle(articleId)
  }

  /**
   * Instantané à la demande, hors transition. Même règle de propriété que
   * `update()` : un AUTHOR ne peut le faire que sur ses propres articles.
   */
  async createVersion(
    userId: string,
    domainId: string,
    articleId: string,
    changeNote?: string,
  ): Promise<ArticleVersion> {
    const member = await this.requireMember(userId, domainId)
    const article = await this.findForUser(userId, domainId, articleId)
    if (member.role === DomainRole.AUTHOR && article.authorId !== userId) {
      throw new ForbiddenException('Vous ne pouvez versionner que vos propres articles')
    }
    return this.prisma.$transaction((tx) =>
      this.versions.snapshot(tx, articleId, userId, article.title, article.content, changeNote),
    )
  }

  /**
   * Restaure le contenu d'une version passée. Choix : requiert au moins
   * AUTHOR (comme `update()`, dont c'est une variante — restaurer modifie le
   * contenu, donc le rôle minimum est celui qui autorise déjà à modifier le
   * contenu), avec la même restriction de propriété qu'`update()`. La
   * restauration ne change PAS le statut de l'article : elle ne rejoue pas
   * le workflow, elle réécrit seulement le contenu.
   *
   * Ne régresse jamais le numéro de version : restaurer `v2` crée une
   * NOUVELLE version (`v5` si `v1..v4` existent), qui laisse `v2` intacte et
   * rend la restauration elle-même réversible. `renderedHtml`/`wordCount`
   * sont recalculés à partir du contenu restauré, jamais copiés depuis
   * l'instantané (ce sont des valeurs dérivées, comme dans `update()`).
   */
  async restoreVersion(userId: string, domainId: string, articleId: string, version: number): Promise<Article> {
    const member = await this.requireMember(userId, domainId)
    const article = await this.findForUser(userId, domainId, articleId)
    if (member.role === DomainRole.AUTHOR && article.authorId !== userId) {
      throw new ForbiddenException('Vous ne pouvez restaurer que vos propres articles')
    }

    const target = await this.versions.findVersion(articleId, version)
    if (!target) throw new NotFoundException('Version introuvable')

    const { renderedHtml, wordCount } = this.renderContent(target.content)

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: articleId },
        data: { title: target.title, content: target.content, renderedHtml, wordCount },
      })
      const snapshot = await this.versions.snapshot(tx, articleId, userId, updated.title, updated.content, `restore-v${version}`)
      return { ...updated, currentVersion: snapshot.version }
    })
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
