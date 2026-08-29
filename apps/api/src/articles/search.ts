import type { Article } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'
import type { PageInput } from '../common/dto/page.input'

/**
 * Recherche plein texte sur `Article.searchVector` (colonne générée,
 * pondération titre `A` / contenu `B` — voir la migration
 * `20260825180147_article_search_vector`, jamais utilisée avant cette
 * tâche).
 *
 * `websearch_to_tsquery` (plutôt que `to_tsquery`) accepte n'importe quel
 * texte utilisateur brut sans jamais lever d'erreur sur une syntaxe
 * inattendue (`'`, `%`, `;`, `--`, guillemets non fermés...) : c'est ce qui
 * rend cette fonction sûre à exposer directement à une entrée utilisateur.
 *
 * Toute valeur interpolée (`userId`, `domainId`, `query`, `limit`, `offset`)
 * passe par le template tag `Prisma.sql`/`$queryRaw`, qui les lie en
 * paramètres de requête préparée — jamais concaténés dans le texte SQL. Voir
 * `article-search.int-spec.ts` pour la preuve par le test d'injection, et le
 * commit de cette tâche pour la vérification par mutation (interpolation de
 * chaîne testée puis immédiatement révoquée).
 *
 * Le filtre d'appartenance au domaine (`INNER JOIN "DomainMember"`) vit DANS
 * la requête SQL, pas en post-traitement JavaScript : appliqué après coup,
 * il fausserait `totalCount`/`LIMIT`/`OFFSET` (la pagination porterait sur
 * des lignes qui seraient ensuite jetées) et ferait transiter des données
 * d'autres domaines pour rien. Redondant avec le contrôle déjà fait par
 * `DomainRoleGuard` sur `domainId` au niveau du resolver — défense en
 * profondeur, comme le reste du code de ce lot.
 */
export async function searchArticles(
  prisma: PrismaService,
  userId: string,
  domainId: string,
  query: string,
  page: PageInput,
): Promise<{ items: Article[]; totalCount: number }> {
  const [items, countRows] = await prisma.$transaction([
    prisma.$queryRaw<Article[]>`
      SELECT
        a."id", a."domainId", a."topicId", a."authorId", a."categoryId",
        a."title", a."slug", a."content", a."renderedHtml", a."excerpt",
        a."coverImageUrl", a."status", a."currentVersion", a."wordCount",
        a."latestSeoScore", a."scheduledAt", a."publishedAt",
        a."seoTitle", a."metaDescription", a."canonicalUrl", a."focusKeyword",
        a."secondaryKeywords", a."robotsIndex", a."robotsFollow",
        a."createdAt", a."updatedAt"
      FROM "Article" a
      INNER JOIN "DomainMember" dm ON dm."domainId" = a."domainId" AND dm."userId" = ${userId}
      WHERE a."domainId" = ${domainId}
        AND a."searchVector" @@ websearch_to_tsquery('simple', ${query})
      ORDER BY ts_rank(a."searchVector", websearch_to_tsquery('simple', ${query})) DESC, a."createdAt" DESC
      LIMIT ${page.limit} OFFSET ${page.offset}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Article" a
      INNER JOIN "DomainMember" dm ON dm."domainId" = a."domainId" AND dm."userId" = ${userId}
      WHERE a."domainId" = ${domainId}
        AND a."searchVector" @@ websearch_to_tsquery('simple', ${query})
    `,
  ])

  return { items, totalCount: Number(countRows[0]?.count ?? 0) }
}
