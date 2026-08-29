import DataLoader from 'dataloader'
import { Prisma } from '@prisma/client'
import type { Category, Domain, Tag, User } from '@prisma/client'
import type { PrismaService } from '../../prisma/prisma.service'

export interface Loaders {
  userById: DataLoader<string, User | null>
  domainById: DataLoader<string, Domain | null>
  categoryById: DataLoader<string, Category | null>
  tagsByArticleId: DataLoader<string, Tag[]>
  childrenByParentId: DataLoader<string, Category[]>
  articleCountByCategoryId: DataLoader<string, number>
}

/**
 * Un loader par relation, instancié PAR REQUÊTE GraphQL (voir
 * `graphql.module.ts` : `context: (...) => ({ ..., loaders: createLoaders(prisma) })`,
 * appelé une fois par requête entrante). Un loader partagé entre requêtes
 * mettrait en cache la ligne chargée pour un utilisateur et la resservirait
 * telle quelle à un autre — une fuite de données, pas une optimisation (voir
 * `n-plus-one.int-spec.ts`, "isolation entre requêtes").
 *
 * Chaque batch resout dans l'ORDRE des clés reçues (DataLoader l'exige) :
 * une `Map` intermédiaire plutôt qu'un simple `find` par clé, pour rester en
 * une seule requête SQL quel que soit le nombre de clés du batch.
 */
export function createLoaders(prisma: PrismaService): Loaders {
  return {
    userById: new DataLoader<string, User | null>(async (ids) => {
      const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } } })
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.map((id) => byId.get(id) ?? null)
    }),

    domainById: new DataLoader<string, Domain | null>(async (ids) => {
      const rows = await prisma.domain.findMany({ where: { id: { in: [...ids] } } })
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.map((id) => byId.get(id) ?? null)
    }),

    categoryById: new DataLoader<string, Category | null>(async (ids) => {
      const rows = await prisma.category.findMany({ where: { id: { in: [...ids] } } })
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.map((id) => byId.get(id) ?? null)
    }),

    // `prisma.articleTag.findMany({ include: { tag: true } })` émettrait DEUX
    // requêtes SQL (une pour `ArticleTag`, une pour `Tag` — Prisma sans le
    // preview feature `relationJoins` résout une relation par un aller-retour
    // séparé) : une jointure SQL explicite ramène ce batch à une seule
    // requête, quel que soit le nombre d'articles demandés.
    tagsByArticleId: new DataLoader<string, Tag[]>(async (articleIds) => {
      if (articleIds.length === 0) return []
      const rows = await prisma.$queryRaw<Array<Tag & { articleId: string }>>`
        SELECT t."id", t."domainId", t."name", t."slug", at."articleId"
        FROM "ArticleTag" at
        INNER JOIN "Tag" t ON t."id" = at."tagId"
        WHERE at."articleId" IN (${Prisma.join([...articleIds])})
      `
      const byArticle = new Map<string, Tag[]>(articleIds.map((id) => [id, []]))
      for (const { articleId, ...tag } of rows) {
        byArticle.get(articleId)?.push(tag)
      }
      return articleIds.map((id) => byArticle.get(id) ?? [])
    }),

    // `Category.children` (Task 12) : mêmes justifications que les loaders
    // ci-dessus (une requête batchée plutôt qu'une par parent).
    childrenByParentId: new DataLoader<string, Category[]>(async (parentIds) => {
      const rows = await prisma.category.findMany({ where: { parentId: { in: [...parentIds] } } })
      const byParent = new Map<string, Category[]>(parentIds.map((id) => [id, []]))
      for (const row of rows) {
        if (row.parentId) byParent.get(row.parentId)?.push(row)
      }
      return parentIds.map((id) => byParent.get(id) ?? [])
    }),

    // `Category.articleCount` (Task 12) : `groupBy` ramène le compte de
    // TOUTES les catégories du batch en une seule requête SQL (`GROUP BY
    // categoryId`), plutôt qu'un `count()` par catégorie.
    articleCountByCategoryId: new DataLoader<string, number>(async (categoryIds) => {
      const rows = await prisma.article.groupBy({
        by: ['categoryId'],
        where: { categoryId: { in: [...categoryIds] } },
        _count: { _all: true },
      })
      const byCategory = new Map<string, number>(
        rows.filter((row) => row.categoryId !== null).map((row) => [row.categoryId as string, row._count._all]),
      )
      return categoryIds.map((id) => byCategory.get(id) ?? 0)
    }),
  }
}
