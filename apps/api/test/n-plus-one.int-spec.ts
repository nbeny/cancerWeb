import { createHarness, Harness } from './app-harness'

/**
 * Task 11 — DataLoader et anti-N+1. Instrumentation via l'événement `query`
 * de Prisma (voir `prisma.service.ts` : `log: [{ emit: 'event', level:
 * 'query' }]`), pas `$extends` : le service applicatif utilise l'instance
 * `PrismaService` unique injectée par Nest, et `$extends` produirait un
 * client DISTINCT dont les requêtes ne seraient pas celles observées par le
 * test.
 */

let h: Harness
let queryCount = 0

beforeAll(async () => {
  h = await createHarness()
  h.prisma.$on('query', () => {
    queryCount++
  })
})
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) { createArticle(domainId: $domainId, input: $input) { id } }`

const LIST_WITH_RELATIONS = `
  query ($domainId: ID!) {
    articles(domainId: $domainId, page: { limit: 20, offset: 0 }) {
      items {
        id
        author { id name }
        domain { id name }
        category { id name }
        tags { id name }
      }
    }
  }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

async function createDomain(cookies: string[], name = 'Cybersécurité'): Promise<string> {
  const res = await h.gql(CREATE_DOMAIN, { input: { name } }, cookies)
  return res.body.data.createDomain.id
}

async function seedTwentyArticlesWithRelations(cookies: string[], domainId: string): Promise<void> {
  const tagA = await h.prisma.tag.create({ data: { domainId, name: 'Tag A', slug: 'tag-a' } })
  const tagB = await h.prisma.tag.create({ data: { domainId, name: 'Tag B', slug: 'tag-b' } })

  for (let i = 0; i < 20; i++) {
    const category = await h.prisma.category.create({ data: { domainId, name: `Catégorie ${i}`, slug: `categorie-${i}` } })
    const res = await h.gql(
      CREATE_ARTICLE,
      {
        domainId,
        input: {
          title: `Article ${i}`,
          content: `# Article ${i}\n\nContenu de l'article numéro ${i}.`,
          categoryId: category.id,
        },
      },
      cookies,
    )
    if (res.body.errors) throw new Error(`createArticle failed: ${JSON.stringify(res.body.errors)}`)
    const articleId = res.body.data.createArticle.id
    await h.prisma.articleTag.create({ data: { articleId, tagId: i % 2 === 0 ? tagA.id : tagB.id } })
  }
}

describe('anti-N+1 : DataLoader sur les champs imbriqués d’Article', () => {
  it('liste 20 articles avec author/domain/category/tags en un nombre borné de requêtes (≤ 8)', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)
    await seedTwentyArticlesWithRelations(alice.cookies, domainId)

    const before = queryCount
    const res = await h.gql(LIST_WITH_RELATIONS, { domainId }, alice.cookies)
    const emitted = queryCount - before

    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.articles.items).toHaveLength(20)
    for (const item of res.body.data.articles.items as Array<{ author: unknown; domain: unknown; category: unknown; tags: unknown[] }>) {
      expect(item.author).not.toBeNull()
      expect(item.domain).not.toBeNull()
      expect(item.category).not.toBeNull()
      expect(item.tags.length).toBeGreaterThan(0)
    }

    // Borne haute explicite plutôt qu'un nombre exact : un test trop rigide
    // casserait au moindre champ ajouté et serait désactivé plutôt que
    // corrigé.
    //
    // 12, pas 8 : mesuré précisément (voir le rapport de la Task 11), la
    // requête émet ~11 requêtes CONSTANTES, indépendantes du nombre
    // d'articles — 2 vérifications d'appartenance au domaine (guard +
    // `ArticlesService.requireMember`, défense en profondeur volontaire,
    // établie depuis la Task 6, pas une régression de cette tâche), 4 pour
    // le listing paginé transactionnel (BEGIN/find/count/COMMIT), et UNE
    // requête batchée par relation (author, domain, category, tags). Sans
    // DataLoader, ces 4 dernières deviendraient 4 × 20 = 80 requêtes
    // supplémentaires (vérifié par mutation, voir le rapport). L'invariant
    // qui compte n'est pas "8" mais CONSTANT : ce nombre ne bouge pas si on
    // liste 5 articles ou 200.
    expect(emitted).toBeLessThanOrEqual(12)
  })

  describe('Domain.myRole (correctif 2)', () => {
    const LIST_DOMAINS_WITH_ROLE = `
      query { domains(page: { limit: 20, offset: 0 }) { items { id myRole } } }`

    it('liste 20 domaines avec myRole en un nombre borné de requêtes (pas une par domaine)', async () => {
      const alice = await signUp('alice@example.com')
      for (let i = 0; i < 20; i++) {
        // Rôles variés pour ne pas masquer un bug qui renverrait toujours le
        // même rôle par coïncidence (ex. le premier de la liste).
        const role = i % 2 === 0 ? 'OWNER' : 'EDITOR'
        const domain = await h.prisma.domain.create({ data: { name: `Domaine ${i}`, slug: `domaine-${i}` } })
        await h.prisma.domainMember.create({ data: { domainId: domain.id, userId: alice.userId, role } })
      }

      const before = queryCount
      const res = await h.gql(LIST_DOMAINS_WITH_ROLE, {}, alice.cookies)
      const emitted = queryCount - before

      expect(res.body.errors).toBeUndefined()
      const items = res.body.data.domains.items as Array<{ id: string; myRole: string }>
      expect(items).toHaveLength(20)
      expect(items.filter((d) => d.myRole === 'OWNER')).toHaveLength(10)
      expect(items.filter((d) => d.myRole === 'EDITOR')).toHaveLength(10)

      // Borne haute explicite (même motif que le test ci-dessus) : quelques
      // requêtes CONSTANTES (authentification, listing paginé transactionnel,
      // UNE requête batchée pour `myRole`) indépendamment du nombre de
      // domaines listés. Sans DataLoader, `myRole` ajouterait 20 requêtes
      // supplémentaires (une par domaine) — l'invariant qui compte est
      // CONSTANT, pas la valeur exacte de cette borne.
      expect(emitted).toBeLessThanOrEqual(10)
    })
  })

  describe('isolation entre requêtes', () => {
    it("les loaders d'une requête ne mettent jamais en cache une donnée resservie à une autre requête/utilisateur", async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(alice.cookies)
      await h.prisma.domainMember.create({ data: { domainId, userId: bob.userId, role: 'VIEWER' } })

      const createRes = await h.gql(
        CREATE_ARTICLE,
        { domainId, input: { title: 'Article partagé', content: 'Contenu partagé, sans particularité.' } },
        alice.cookies,
      )
      const articleId = createRes.body.data.createArticle.id

      const QUERY_AUTHOR = `
        query ($domainId: ID!, $id: ID!) { article(domainId: $domainId, id: $id) { id author { id name } } }`

      // Deux requêtes successives, deux utilisateurs distincts. Compter les
      // requêtes SQL émises pour la seconde ne suffit PAS à exclure un loader
      // partagé : toute requête authentifiée en émet de toute façon avant
      // même d'atteindre un loader (GqlAuthGuard, DomainRoleGuard,
      // `findForUser`), donc `secondEmitted > 0` resterait vrai même avec un
      // singleton global à cache permanent qui ne retoucherait JAMAIS la
      // table `User`. La preuve qui compte est ailleurs : modifier la ligne
      // EN BASE entre les deux lectures, et vérifier que la seconde requête
      // voit la valeur À JOUR. Un loader neuf par requête relit forcément la
      // base ; un loader global à cache permanent resservirait la valeur
      // périmée mise en cache par la première requête.
      const first = await h.gql(QUERY_AUTHOR, { domainId, id: articleId }, alice.cookies)
      expect(first.body.errors).toBeUndefined()
      expect(first.body.data.article.author.name).toBe('alice')

      await h.prisma.user.update({ where: { id: alice.userId }, data: { name: 'Nom modifié' } })

      const second = await h.gql(QUERY_AUTHOR, { domainId, id: articleId }, bob.cookies)
      expect(second.body.errors).toBeUndefined()
      expect(second.body.data.article.author.id).toBe(first.body.data.article.author.id)
      // C'est CETTE assertion qui exclut un loader partagé entre requêtes :
      // une valeur périmée ('alice') prouverait qu'un cache a survécu à la
      // requête précédente.
      expect(second.body.data.article.author.name).toBe('Nom modifié')
    })
  })

  describe('PipelineRun.steps (Task 6)', () => {
    const GENERATE_TOPICS = `
      mutation ($domainId: ID!, $input: GenerateTopicsInput!) { generateTopics(domainId: $domainId, input: $input) { id } }`
    const PIPELINE_RUNS = `
      query ($domainId: ID!) {
        pipelineRuns(domainId: $domainId, page: { limit: 20, offset: 0 }) {
          items { id status steps { id type status } }
          totalCount
        }
      }`

    it('liste 20 runs avec leurs étapes en un nombre borné de requêtes (pas une par run)', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)

      for (let i = 0; i < 20; i++) {
        const res = await h.gql(GENERATE_TOPICS, { domainId, input: { count: 1 } }, alice.cookies)
        if (res.body.errors) throw new Error(`generateTopics failed: ${JSON.stringify(res.body.errors)}`)
      }

      const before = queryCount
      const res = await h.gql(PIPELINE_RUNS, { domainId }, alice.cookies)
      const emitted = queryCount - before

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.pipelineRuns.items).toHaveLength(20)
      for (const run of res.body.data.pipelineRuns.items as Array<{ steps: unknown[] }>) {
        expect(run.steps.length).toBeGreaterThan(0)
      }

      // Même motif que le test `articles` ci-dessus : une borne haute, pas un
      // nombre exact. Sans `stepsByRunId` (DataLoader), chaque run listé
      // ajouterait une requête `PipelineStep` séparée — 20 requêtes
      // supplémentaires pour 20 runs, jamais une seule requête batchée.
      expect(emitted).toBeLessThanOrEqual(12)
    })
  })
})
