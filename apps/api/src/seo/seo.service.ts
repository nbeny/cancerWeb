import { Injectable } from '@nestjs/common'
import { Prisma, SeoReport as PrismaSeoReport } from '@prisma/client'
import type { Root } from 'mdast'
import { PrismaService } from '../prisma/prisma.service'
import { ArticlesService } from '../articles/articles.service'
import { PageInput } from '../common/dto/page.input'
import { parse, extractLinks } from '../markdown'
import { analyze } from './analyzer'
import type { SeoContext, SeoIssue } from './types'

/**
 * `SeoReport` tel que retourne par ce service : `issues`/`metrics` sont
 * types precisement (`SeoIssue[]`, `Record<string, number>`) plutot que
 * `Prisma.JsonValue` (le type que Prisma attribue a toute colonne `Json`).
 * Le cast `as unknown as SeoReportRecord` au point d'ecriture est sur : ce
 * sont exactement les objets que ce service vient de construire et de
 * serialiser, jamais une valeur Json arbitraire venue d'ailleurs.
 */
export interface SeoReportRecord extends Omit<PrismaSeoReport, 'issues' | 'metrics'> {
  issues: SeoIssue[]
  metrics: Record<string, number>
}

// Convention retenue pour reconnaitre un lien interne vers un article :
// `/articles/<slug>` ou `articles/<slug>`, avec ou sans suffixe
// (ancre, query string). Un lien interne qui ne suit pas ce motif (ex. vers
// une page statique) n'est pas actionnable ici : on ne peut pas le
// confronter a une table `Article`, donc on ne le signale pas.
const INTERNAL_ARTICLE_LINK = /^\/?articles\/([^/?#]+)/

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
  ) {}

  /**
   * Analyse l'article, persiste le rapport et denormalise `latestSeoScore`
   * sur l'article, dans une seule transaction (voir `applyLatestScore`).
   *
   * `articles.findForUser` referme la confusion de domaine : un `domainId`
   * dont l'appelant est membre mais qui ne correspond pas au domaine reel de
   * l'article echoue ici en NOT_FOUND, avant tout calcul.
   */
  async analyze(userId: string, domainId: string, articleId: string): Promise<SeoReportRecord> {
    const article = await this.articles.findForUser(userId, domainId, articleId)
    const domain = await this.prisma.domain.findUniqueOrThrow({ where: { id: article.domainId } })

    const ast = parse(article.content)
    const ctx: SeoContext = {
      seoTitle: article.seoTitle,
      metaDescription: article.metaDescription,
      focusKeyword: article.focusKeyword,
      slug: article.slug,
      language: domain.language,
    }

    const pure = analyze(ast, ctx)
    const linkIssues = await this.brokenInternalLinkIssues(ast, article.domainId)
    const issues = [...pure.issues, ...linkIssues]

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.seoReport.create({
        data: {
          articleId,
          score: pure.score,
          issues: issues as unknown as Prisma.InputJsonValue,
          metrics: pure.metrics as unknown as Prisma.InputJsonValue,
        },
      })
      await this.applyLatestScore(tx, articleId, pure.score)
      return report as unknown as SeoReportRecord
    })
  }

  async listReports(
    userId: string,
    domainId: string,
    articleId: string,
    page: PageInput,
  ): Promise<{ items: SeoReportRecord[]; totalCount: number }> {
    await this.articles.findForUser(userId, domainId, articleId)
    const where: Prisma.SeoReportWhereInput = { articleId }
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.seoReport.findMany({ where, orderBy: { computedAt: 'desc' }, take: page.limit, skip: page.offset }),
      this.prisma.seoReport.count({ where }),
    ])
    return { items: items as unknown as SeoReportRecord[], totalCount }
  }

  /**
   * Etape separee - plutot qu'inlinee dans `analyze` - pour rester mockable
   * independamment, comme `VersionsService.snapshot` dans
   * `article-workflow.int-spec.ts` : un test peut la faire echouer pour
   * prouver que la creation du rapport, elle, est bien annulee par
   * Postgres (atomicite de la transaction).
   */
  async applyLatestScore(tx: Prisma.TransactionClient, articleId: string, score: number): Promise<void> {
    await tx.article.update({ where: { id: articleId }, data: { latestSeoScore: score } })
  }

  /**
   * Seul enrichissement autorise au-dela de l'analyseur pur (voir
   * `criteria/links.ts`, qui documente explicitement ce report) : la
   * validite des liens internes reconnus, contre les articles du MEME
   * domaine que celui analyse.
   */
  private async brokenInternalLinkIssues(ast: Root, domainId: string): Promise<SeoIssue[]> {
    const { internal } = extractLinks(ast)
    const issues: SeoIssue[] = []

    for (const link of internal) {
      const match = INTERNAL_ARTICLE_LINK.exec(link.href)
      const slug = match?.[1]
      if (!slug) continue

      const target = await this.prisma.article.findUnique({ where: { domainId_slug: { domainId, slug } } })
      if (!target) {
        issues.push({
          code: 'INTERNAL_LINK_BROKEN',
          severity: 'WARNING',
          message: `Le lien interne "${link.href}" ne correspond a aucun article existant de ce domaine.`,
        })
      }
    }

    return issues
  }
}
