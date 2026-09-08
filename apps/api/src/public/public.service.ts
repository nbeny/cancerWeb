import { Injectable, NotFoundException } from '@nestjs/common'
import { Article, ArticleStatus, Domain, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PageInput } from '../common/dto/page.input'

/**
 * Conditions de visibilité publique d'un article. Factorisées en UNE
 * définition employée par toutes les lectures de ce service : une requête qui
 * les oublierait exposerait des brouillons, et le seul moyen fiable
 * d'empêcher cet oubli est qu'il n'existe pas de seconde formulation.
 *
 * `publishedAt <= maintenant` n'est pas redondant avec `status = PUBLISHED` :
 * `schedule()` (articles.service.ts) positionne `scheduledAt` sans
 * `publishedAt`, mais rien n'interdit qu'une reprise de données laisse un
 * PUBLISHED daté dans le futur. On filtre sur la date effective.
 *
 * `not: null` est lui aussi conservé bien que `lte` exclue déjà les NULL en
 * SQL : il dit explicitement qu'un article sans date de publication n'est pas
 * publiable, plutôt que de laisser cette garantie dépendre d'un détail de la
 * sémantique trois-états de SQL que la prochaine relecture devra redécouvrir.
 */
function publishedWhere(domainId: string): Prisma.ArticleWhereInput {
  return {
    domainId,
    status: ArticleStatus.PUBLISHED,
    publishedAt: { not: null, lte: new Date() },
  }
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Résout un domaine par son slug. Un domaine sans aucun article publié est
   * traité comme inexistant : la base contient des domaines de test e2e qui
   * exposeraient sinon autant de blogs vides.
   *
   * Toutes les autres lectures passent par ici : c'est ce qui garantit qu'un
   * `domainSlug` inconnu, un domaine privé et un domaine vide donnent la même
   * réponse, et qu'aucune méthode ne peut lire les articles d'un domaine sans
   * avoir d'abord franchi ce contrôle.
   */
  async domainBySlug(slug: string): Promise<Domain> {
    const domain = await this.prisma.domain.findUnique({ where: { slug } })
    if (!domain) throw new NotFoundException('Blog introuvable')

    const published = await this.prisma.article.count({ where: publishedWhere(domain.id) })
    if (published === 0) throw new NotFoundException('Blog introuvable')

    return domain
  }

  async articles(domainSlug: string, page: PageInput): Promise<{ items: Article[]; totalCount: number }> {
    const domain = await this.domainBySlug(domainSlug)
    const where = publishedWhere(domain.id)

    // `totalCount` porte le MÊME `where` que `findMany` : un compteur calculé
    // sur l'ensemble des articles du domaine révélerait le volume de travail
    // non publié sans en montrer une ligne.
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.article.count({ where }),
    ])

    return { items, totalCount }
  }

  async articleBySlug(domainSlug: string, slug: string): Promise<Article> {
    const domain = await this.domainBySlug(domainSlug)
    // `findFirst` et non `findUnique` : la contrainte d'unicité est
    // `@@unique([domainId, slug])`, donc `slug` seul ne désigne rien. Le
    // `domainId` vient de `publishedWhere`, jamais du client.
    const article = await this.prisma.article.findFirst({ where: { ...publishedWhere(domain.id), slug } })
    if (!article) throw new NotFoundException('Article introuvable')
    return article
  }
}
