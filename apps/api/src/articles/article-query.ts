import { Prisma } from '@prisma/client'
import type { Article } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'
import type { PageInput } from '../common/dto/page.input'
import { ArticleFilter, ArticleSort, ArticleSortField, SortDirection } from './article.types'

/**
 * Filtrage + tri de la query `articles`, EN UNE SEULE requête SQL brute
 * (`$queryRaw`), que `filter.search` soit utilisé ou non.
 *
 * Pourquoi une seule requête plutôt que deux chemins (l'API Prisma pour les
 * filtres simples, `$queryRaw` seulement pour `search`, comme avant ce
 * correctif) : Prisma ne sait de toute façon pas interroger un `tsvector`
 * (`search`), donc `$queryRaw` est déjà incontournable dès que `search` est
 * actif. Faire porter TOUS les filtres par la même requête, tout le temps,
 * évite que deux implémentations distinctes du même filtre (ex. `tagIds` en
 * "au moins un" côté Prisma mais "tous" côté SQL brut par oubli) divergent
 * silencieusement — un risque bien réel vu le nombre de filtres combinables.
 * Le coût : une seule fonction à auditer pour l'injection plutôt qu'aucune
 * pour la moitié des filtres, ce qui est aussi plus simple à vérifier.
 *
 * Le filtre d'appartenance au domaine (`INNER JOIN "DomainMember"`) vit DANS
 * cette requête, jamais en post-traitement JavaScript — voir la jsdoc
 * d'origine de cette fonction (Task 10) pour la justification complète :
 * appliqué après coup, il fausserait `totalCount`/`LIMIT`/`OFFSET`.
 * Redondant avec `DomainRoleGuard` + `ArticlesService.requireMember` —
 * défense en profondeur assumée, comme partout ailleurs dans ce lot.
 *
 * Toute valeur interpolée passe par le template tag `Prisma.sql`, qui la lie
 * en paramètre de requête préparée — jamais concaténée dans le texte SQL
 * (voir `article-search.int-spec.ts` et `article-filter-sort.int-spec.ts`
 * pour la preuve par les tests d'injection et de confusion de domaine).
 */
const ARTICLE_COLUMNS = Prisma.sql`
  a."id", a."domainId", a."topicId", a."authorId", a."categoryId",
  a."title", a."slug", a."content", a."renderedHtml", a."excerpt",
  a."coverImageUrl", a."status", a."currentVersion", a."wordCount",
  a."latestSeoScore", a."scheduledAt", a."publishedAt",
  a."seoTitle", a."metaDescription", a."canonicalUrl", a."focusKeyword",
  a."secondaryKeywords", a."robotsIndex", a."robotsFollow",
  a."createdAt", a."updatedAt"
`

const SORT_COLUMNS: Record<ArticleSortField, Prisma.Sql> = {
  [ArticleSortField.CREATED_AT]: Prisma.sql`a."createdAt"`,
  [ArticleSortField.UPDATED_AT]: Prisma.sql`a."updatedAt"`,
  [ArticleSortField.PUBLISHED_AT]: Prisma.sql`a."publishedAt"`,
  [ArticleSortField.TITLE]: Prisma.sql`a."title"`,
  [ArticleSortField.SEO_SCORE]: Prisma.sql`a."latestSeoScore"`,
}

// Colonnes nullable dont les `null` doivent être relégués en fin de tri,
// quel que soit `direction` (voir la jsdoc d'`ArticleSort`).
const NULLABLE_SORT_FIELDS = new Set<ArticleSortField>([ArticleSortField.SEO_SCORE, ArticleSortField.PUBLISHED_AT])

function buildWhere(domainId: string, filter: ArticleFilter | undefined): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`a."domainId" = ${domainId}`]

  if (filter?.status && filter.status.length > 0) {
    // `::text` : Prisma lie les paramètres avec un type PostgreSQL explicite
    // (`text`), pas `unknown` — sans ce cast côté colonne, Postgres refuse la
    // comparaison entre l'enum `"ArticleStatus"` et un paramètre `text`
    // ("operator does not exist: ArticleStatus = text"), il n'y a pas
    // d'inférence implicite ici comme il y en aurait pour un littéral SQL
    // écrit à la main.
    conditions.push(Prisma.sql`a."status"::text IN (${Prisma.join(filter.status)})`)
  }
  if (filter?.authorId) {
    conditions.push(Prisma.sql`a."authorId" = ${filter.authorId}`)
  }
  if (filter?.categoryId) {
    conditions.push(Prisma.sql`a."categoryId" = ${filter.categoryId}`)
  }
  if (filter?.tagIds && filter.tagIds.length > 0) {
    // "Au moins un" (OR) : voir la jsdoc d'`ArticleFilter`.
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ArticleTag" fat WHERE fat."articleId" = a."id" AND fat."tagId" IN (${Prisma.join(filter.tagIds)}))`,
    )
  }
  if (filter?.minSeoScore != null) {
    // `NULL >= x` est NULL (donc exclu) : un article jamais analysé sort
    // naturellement du filtre, sans clause `IS NOT NULL` dédiée.
    conditions.push(Prisma.sql`a."latestSeoScore" >= ${filter.minSeoScore}`)
  }
  if (filter?.publishedAfter) {
    conditions.push(Prisma.sql`a."publishedAt" >= ${filter.publishedAfter}`)
  }
  if (filter?.publishedBefore) {
    conditions.push(Prisma.sql`a."publishedAt" <= ${filter.publishedBefore}`)
  }

  const search = filter?.search?.trim()
  if (search) {
    conditions.push(Prisma.sql`a."searchVector" @@ websearch_to_tsquery('simple', ${search})`)
  }

  return Prisma.join(conditions, ' AND ')
}

function buildOrderBy(sort: ArticleSort | undefined, searchTerm: string | undefined): Prisma.Sql {
  // `a."id"` en repli final : un tri stable est indispensable pour que la
  // pagination (LIMIT/OFFSET) ne renvoie jamais deux fois la même ligne, ou
  // n'en saute aucune, en cas d'égalité sur la clé de tri principale.
  //
  // `sort` sans `field`/`direction` (objet vide) est équivalent à `sort`
  // absent — voir la jsdoc d'`ArticleSort` dans `article.types.ts` : c'est
  // ce qu'instancie le ValidationPipe de Nest quand l'argument `sort` est
  // omis en entier.
  if (sort?.field && sort?.direction) {
    const column = SORT_COLUMNS[sort.field]
    const direction = sort.direction === SortDirection.ASC ? Prisma.sql`ASC` : Prisma.sql`DESC`
    const nulls = NULLABLE_SORT_FIELDS.has(sort.field) ? Prisma.sql` NULLS LAST` : Prisma.empty
    return Prisma.sql`ORDER BY ${column} ${direction}${nulls}, a."id" ASC`
  }
  if (searchTerm) {
    // Pas de tri explicite mais une recherche active : rang de pertinence,
    // comme avant ce correctif (Task 10).
    return Prisma.sql`ORDER BY ts_rank(a."searchVector", websearch_to_tsquery('simple', ${searchTerm})) DESC, a."createdAt" DESC, a."id" ASC`
  }
  return Prisma.sql`ORDER BY a."createdAt" DESC, a."id" ASC`
}

export async function queryArticles(
  prisma: PrismaService,
  userId: string,
  domainId: string,
  filter: ArticleFilter | undefined,
  sort: ArticleSort | undefined,
  page: PageInput,
): Promise<{ items: Article[]; totalCount: number }> {
  const where = buildWhere(domainId, filter)
  const orderBy = buildOrderBy(sort, filter?.search?.trim())

  const [items, countRows] = await prisma.$transaction([
    prisma.$queryRaw<Article[]>`
      SELECT ${ARTICLE_COLUMNS}
      FROM "Article" a
      INNER JOIN "DomainMember" dm ON dm."domainId" = a."domainId" AND dm."userId" = ${userId}
      WHERE ${where}
      ${orderBy}
      LIMIT ${page.limit} OFFSET ${page.offset}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Article" a
      INNER JOIN "DomainMember" dm ON dm."domainId" = a."domainId" AND dm."userId" = ${userId}
      WHERE ${where}
    `,
  ])

  return { items, totalCount: Number(countRows[0]?.count ?? 0) }
}
