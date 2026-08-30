import DataLoader from 'dataloader'
import { Prisma } from '@prisma/client'
import type { AIJob, Article, Category, Domain, DomainRole, PipelineStep, Tag, Topic, User } from '@prisma/client'
import type { PrismaService } from '../../prisma/prisma.service'

export interface Loaders {
  userById: DataLoader<string, User | null>
  domainById: DataLoader<string, Domain | null>
  categoryById: DataLoader<string, Category | null>
  tagsByArticleId: DataLoader<string, Tag[]>
  childrenByParentId: DataLoader<string, Category[]>
  articleCountByCategoryId: DataLoader<string, number>
  myRoleByDomain: DataLoader<string, DomainRole | null>
  articleById: DataLoader<string, Article | null>
  topicById: DataLoader<string, Topic | null>
  stepsByRunId: DataLoader<string, PipelineStep[]>
  jobsByStepId: DataLoader<string, AIJob[]>
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

    // `Domain.myRole` (Task 18, correctif 2) : le rôle de l'UTILISATEUR
    // COURANT sur un domaine — jamais celui d'un autre. Clé composite
    // `${userId}:${domainId}`, pas seulement `domainId` : ce loader est déjà
    // instancié PAR REQUÊTE (voir la jsdoc en tête de fichier), donc toutes
    // les clés qu'il reçoit portent de toute façon le même utilisateur —
    // mais encoder l'utilisateur DANS la clé rend cet invariant vérifiable
    // par construction plutôt que par convention, et évite de faire
    // connaître l'utilisateur courant à `createLoaders` : le contexte
    // GraphQL est construit AVANT que `GqlAuthGuard` ne peuple `req.user`
    // (voir `graphql.module.ts`, `context: ({ req, res }) => ({ ...,
    // loaders: createLoaders(prisma) })`), donc `req.user` n'existe pas
    // encore à cet instant.
    myRoleByDomain: new DataLoader<string, DomainRole | null>(async (keys) => {
      const pairs = keys.map((key) => {
        const [userId, domainId] = key.split(':')
        return { userId, domainId }
      })
      const rows = await prisma.domainMember.findMany({
        where: { OR: pairs.map(({ userId, domainId }) => ({ userId, domainId })) },
      })
      const byKey = new Map(rows.map((row) => [`${row.userId}:${row.domainId}`, row.role]))
      return keys.map((key) => byKey.get(key) ?? null)
    }),

    // `PipelineRun.article`/`PipelineRun.topic` (Task 6) : même motif que
    // `domainById`/`categoryById` — un batch par relation plutôt qu'un
    // `findUnique` par run listé (`pipelineRuns`, `pipelineQueue`).
    articleById: new DataLoader<string, Article | null>(async (ids) => {
      const rows = await prisma.article.findMany({ where: { id: { in: [...ids] } } })
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.map((id) => byId.get(id) ?? null)
    }),

    topicById: new DataLoader<string, Topic | null>(async (ids) => {
      const rows = await prisma.topic.findMany({ where: { id: { in: [...ids] } } })
      const byId = new Map(rows.map((row) => [row.id, row]))
      return ids.map((id) => byId.get(id) ?? null)
    }),

    // `PipelineRun.steps` (Task 6) : lister N runs avec leurs étapes ne doit
    // coûter qu'UNE requête batchée (`runId IN (...)`), pas une par run —
    // voir `n-plus-one.int-spec.ts`, cas "pipelineRuns". Trié par `order`
    // pour ne jamais dépendre de l'ordre de retour de la base.
    stepsByRunId: new DataLoader<string, PipelineStep[]>(async (runIds) => {
      const rows = await prisma.pipelineStep.findMany({
        where: { runId: { in: [...runIds] } },
        orderBy: { order: 'asc' },
      })
      const byRun = new Map<string, PipelineStep[]>(runIds.map((id) => [id, []]))
      for (const row of rows) byRun.get(row.runId)?.push(row)
      return runIds.map((id) => byRun.get(id) ?? [])
    }),

    // `PipelineStep.jobs` (Task 6) : même motif, batché par `stepId`.
    jobsByStepId: new DataLoader<string, AIJob[]>(async (stepIds) => {
      const rows = await prisma.aIJob.findMany({
        where: { stepId: { in: [...stepIds] } },
        orderBy: { createdAt: 'asc' },
      })
      const byStep = new Map<string, AIJob[]>(stepIds.map((id) => [id, []]))
      for (const row of rows) {
        if (row.stepId) byStep.get(row.stepId)?.push(row)
      }
      return stepIds.map((id) => byStep.get(id) ?? [])
    }),
  }
}
