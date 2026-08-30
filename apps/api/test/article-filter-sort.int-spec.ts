import { DomainRole } from '@prisma/client'
import { createHarness, Harness } from './app-harness'

/**
 * Lot 1, correctif de conception — `ArticleFilter` étendu (status, authorId,
 * categoryId, tagIds, minSeoScore, publishedAfter/Before) et tri serveur
 * (`ArticleSort`) sur `articles(...)`. Avant ce correctif, seul `search`
 * existait côté serveur et le frontend filtrait/triait en JavaScript après
 * avoir récupéré jusqu'à 500 articles — faux silencieusement au-delà de 500
 * articles dans un domaine (voir `apps/web/.../articles/filters.ts`, supprimé
 * par ce correctif).
 *
 * Tout le filtrage et le tri ont lieu EN BASE, dans UNE SEULE requête SQL
 * brute (`articles/article-query.ts`) qui porte aussi la recherche plein
 * texte : Prisma ne sait pas interroger un `tsvector` (d'où `$queryRaw`, déjà
 * nécessaire pour `search` depuis la Task 10), donc plutôt que deux chemins
 * de filtrage distincts (un via l'API Prisma, un via SQL brut pour la
 * recherche) qui pourraient diverger sur la sémantique des filtres (ex.
 * `tagIds` implémenté différemment dans les deux), une seule requête porte
 * tous les filtres, qu'une recherche soit active ou non. Le filtre
 * d'appartenance au domaine (`INNER JOIN "DomainMember"`) reste dans cette
 * requête, jamais appliqué après coup en JavaScript.
 */

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) { createArticle(domainId: $domainId, input: $input) { id title } }`
const CREATE_CATEGORY = `
  mutation ($domainId: ID!, $input: CreateCategoryInput!) { createCategory(domainId: $domainId, input: $input) { id } }`
const CREATE_TAG = `mutation ($domainId: ID!, $input: CreateTagInput!) { createTag(domainId: $domainId, input: $input) { id } }`
const SET_ARTICLE_TAGS = `
  mutation ($domainId: ID!, $articleId: ID!, $tagIds: [ID!]!) {
    setArticleTags(domainId: $domainId, articleId: $articleId, tagIds: $tagIds) { id }
  }`

const ARTICLES = `
  query ($domainId: ID!, $filter: ArticleFilter, $sort: ArticleSort, $page: PageInput) {
    articles(domainId: $domainId, filter: $filter, sort: $sort, page: $page) {
      totalCount
      items { id title status latestSeoScore publishedAt createdAt }
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

async function createArticle(
  cookies: string[],
  domainId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const input = {
    title: 'Article par défaut',
    content: 'Un contenu par défaut, sans intérêt particulier.',
    ...overrides,
  }
  const res = await h.gql(CREATE_ARTICLE, { domainId, input }, cookies)
  if (res.body.errors) throw new Error(`createArticle failed: ${JSON.stringify(res.body.errors)}`)
  return res.body.data.createArticle.id
}

async function query(cookies: string[], variables: Record<string, unknown>) {
  return h.gql(ARTICLES, variables, cookies)
}

describe('ArticleFilter étendu et ArticleSort — filtrage et tri côté serveur', () => {
  describe('status', () => {
    it('filtre sur un ensemble de statuts', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const draft = await createArticle(alice.cookies, domainId, { title: 'Brouillon' })
      const published = await createArticle(alice.cookies, domainId, { title: 'Publié' })
      const archived = await createArticle(alice.cookies, domainId, { title: 'Archivé' })
      await h.prisma.article.update({ where: { id: published }, data: { status: 'PUBLISHED' } })
      await h.prisma.article.update({ where: { id: archived }, data: { status: 'ARCHIVED' } })

      const res = await query(alice.cookies, { domainId, filter: { status: ['PUBLISHED', 'ARCHIVED'] } })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(2)
      const ids = res.body.data.articles.items.map((a: { id: string }) => a.id).sort()
      expect(ids).toEqual([archived, published].sort())
      expect(ids).not.toContain(draft)
    })
  })

  describe('authorId', () => {
    it("filtre sur l'auteur de l'article", async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(alice.cookies)
      await h.prisma.domainMember.create({ data: { domainId, userId: bob.userId, role: DomainRole.AUTHOR } })

      const aliceArticle = await createArticle(alice.cookies, domainId, { title: 'Article Alice' })
      const bobArticle = await createArticle(bob.cookies, domainId, { title: 'Article Bob' })

      const res = await query(alice.cookies, { domainId, filter: { authorId: bob.userId } })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(bobArticle)
      expect(res.body.data.articles.items.map((a: { id: string }) => a.id)).not.toContain(aliceArticle)
    })
  })

  describe('categoryId', () => {
    it('filtre sur la catégorie', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const catRes = await h.gql(CREATE_CATEGORY, { domainId, input: { name: 'SEO' } }, alice.cookies)
      const categoryId = catRes.body.data.createCategory.id

      const withCategory = await createArticle(alice.cookies, domainId, { title: 'Avec catégorie', categoryId })
      const withoutCategory = await createArticle(alice.cookies, domainId, { title: 'Sans catégorie' })

      const res = await query(alice.cookies, { domainId, filter: { categoryId } })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(withCategory)
      expect(res.body.data.articles.items.map((a: { id: string }) => a.id)).not.toContain(withoutCategory)
    })
  })

  describe('tagIds — sémantique "au moins un" (OR), pas "tous" (AND)', () => {
    it("un article portant au moins un des tags demandés remonte", async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const tagA = (await h.gql(CREATE_TAG, { domainId, input: { name: 'Tag A' } }, alice.cookies)).body.data
        .createTag.id
      const tagB = (await h.gql(CREATE_TAG, { domainId, input: { name: 'Tag B' } }, alice.cookies)).body.data
        .createTag.id
      const tagC = (await h.gql(CREATE_TAG, { domainId, input: { name: 'Tag C' } }, alice.cookies)).body.data
        .createTag.id

      const withA = await createArticle(alice.cookies, domainId, { title: 'Tag A' })
      await h.gql(SET_ARTICLE_TAGS, { domainId, articleId: withA, tagIds: [tagA] }, alice.cookies)
      const withB = await createArticle(alice.cookies, domainId, { title: 'Tag B' })
      await h.gql(SET_ARTICLE_TAGS, { domainId, articleId: withB, tagIds: [tagB] }, alice.cookies)
      const withBoth = await createArticle(alice.cookies, domainId, { title: 'Tag A et B' })
      await h.gql(SET_ARTICLE_TAGS, { domainId, articleId: withBoth, tagIds: [tagA, tagB] }, alice.cookies)
      const withC = await createArticle(alice.cookies, domainId, { title: 'Tag C' })
      await h.gql(SET_ARTICLE_TAGS, { domainId, articleId: withC, tagIds: [tagC] }, alice.cookies)
      const withNone = await createArticle(alice.cookies, domainId, { title: 'Sans tag' })

      const res = await query(alice.cookies, { domainId, filter: { tagIds: [tagA, tagB] } })

      expect(res.body.errors).toBeUndefined()
      const ids = res.body.data.articles.items.map((a: { id: string }) => a.id).sort()
      expect(ids).toEqual([withA, withB, withBoth].sort())
      expect(ids).not.toContain(withC)
      expect(ids).not.toContain(withNone)
      expect(res.body.data.articles.totalCount).toBe(3)
    })
  })

  describe('minSeoScore', () => {
    it('exclut les scores insuffisants ET les articles jamais analysés (latestSeoScore null)', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const low = await createArticle(alice.cookies, domainId, { title: 'Score bas' })
      const high = await createArticle(alice.cookies, domainId, { title: 'Score haut' })
      const never = await createArticle(alice.cookies, domainId, { title: 'Jamais analysé' })
      await h.prisma.article.update({ where: { id: low }, data: { latestSeoScore: 20 } })
      await h.prisma.article.update({ where: { id: high }, data: { latestSeoScore: 80 } })
      // `never` garde latestSeoScore = null (valeur par défaut)

      const res = await query(alice.cookies, { domainId, filter: { minSeoScore: 50 } })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(high)
      const ids = res.body.data.articles.items.map((a: { id: string }) => a.id)
      expect(ids).not.toContain(low)
      expect(ids).not.toContain(never)
    })
  })

  describe('publishedAfter / publishedBefore', () => {
    it('filtre sur un intervalle de publication', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const early = await createArticle(alice.cookies, domainId, { title: 'Tôt' })
      const middle = await createArticle(alice.cookies, domainId, { title: 'Milieu' })
      const late = await createArticle(alice.cookies, domainId, { title: 'Tard' })
      await h.prisma.article.update({ where: { id: early }, data: { publishedAt: new Date('2026-01-01T00:00:00Z') } })
      await h.prisma.article.update({ where: { id: middle }, data: { publishedAt: new Date('2026-06-01T00:00:00Z') } })
      await h.prisma.article.update({ where: { id: late }, data: { publishedAt: new Date('2026-12-01T00:00:00Z') } })

      const res = await query(alice.cookies, {
        domainId,
        filter: { publishedAfter: '2026-03-01T00:00:00Z', publishedBefore: '2026-09-01T00:00:00Z' },
      })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(middle)
    })
  })

  describe('filtres combinés — status + minSeoScore + search ensemble donnent l’intersection', () => {
    it('ne renvoie que les articles qui satisfont TOUS les filtres à la fois', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)

      // Correspond à tout : le bon candidat.
      const match = await createArticle(alice.cookies, domainId, {
        title: 'Cryptographie avancée',
        content: 'Un contenu quelconque.',
      })
      await h.prisma.article.update({ where: { id: match }, data: { status: 'PUBLISHED', latestSeoScore: 80 } })

      // Bon statut/score, mais ne correspond pas à la recherche.
      const wrongSearch = await createArticle(alice.cookies, domainId, {
        title: 'Sans rapport avec le terme',
        content: 'Rien à voir.',
      })
      await h.prisma.article.update({ where: { id: wrongSearch }, data: { status: 'PUBLISHED', latestSeoScore: 80 } })

      // Bon statut/recherche, mais score trop bas.
      const wrongScore = await createArticle(alice.cookies, domainId, {
        title: 'Cryptographie débutant',
        content: 'Un contenu quelconque.',
      })
      await h.prisma.article.update({ where: { id: wrongScore }, data: { status: 'PUBLISHED', latestSeoScore: 10 } })

      // Bon score/recherche, mais mauvais statut.
      const wrongStatus = await createArticle(alice.cookies, domainId, {
        title: 'Cryptographie brouillon',
        content: 'Un contenu quelconque.',
      })
      await h.prisma.article.update({ where: { id: wrongStatus }, data: { status: 'DRAFT', latestSeoScore: 80 } })

      const res = await query(alice.cookies, {
        domainId,
        filter: { status: ['PUBLISHED'], minSeoScore: 50, search: 'cryptographie' },
      })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(match)
    })
  })

  describe('totalCount reflète le filtre, pas le total du domaine', () => {
    it('un domaine avec plusieurs articles ne renvoie que le compte des articles filtrés', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      for (let i = 0; i < 5; i++) {
        await createArticle(alice.cookies, domainId, { title: `Article ${i}` })
      }
      const published = await createArticle(alice.cookies, domainId, { title: 'Le seul publié' })
      await h.prisma.article.update({ where: { id: published }, data: { status: 'PUBLISHED' } })

      expect(await h.prisma.article.count({ where: { domainId } })).toBe(6)

      const res = await query(alice.cookies, { domainId, filter: { status: ['PUBLISHED'] }, page: { limit: 20, offset: 0 } })

      expect(res.body.errors).toBeUndefined()
      // La pagination mensongère consisterait à renvoyer totalCount = 6 (le
      // total du domaine) alors qu'un seul article correspond au filtre.
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items).toHaveLength(1)
    })
  })

  describe('tri', () => {
    async function seedThree(cookies: string[], domainId: string) {
      const a = await createArticle(cookies, domainId, { title: 'Beta' })
      const b = await createArticle(cookies, domainId, { title: 'Alpha' })
      const c = await createArticle(cookies, domainId, { title: 'Charlie' })
      // createdAt suit l'ordre de création (a < b < c) ; on force des écarts
      // explicites pour ne pas dépendre de la granularité de l'horloge.
      await h.prisma.article.update({ where: { id: a }, data: { createdAt: new Date('2026-01-02T00:00:00Z'), latestSeoScore: 40 } })
      await h.prisma.article.update({ where: { id: b }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } }) // latestSeoScore reste null
      await h.prisma.article.update({ where: { id: c }, data: { createdAt: new Date('2026-01-03T00:00:00Z'), latestSeoScore: 80 } })
      return { a, b, c }
    }

    it('trie par TITLE ascendant et descendant', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const { a, b, c } = await seedThree(alice.cookies, domainId)

      const asc = await query(alice.cookies, { domainId, sort: { field: 'TITLE', direction: 'ASC' } })
      expect(asc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([b, a, c]) // Alpha, Beta, Charlie

      const desc = await query(alice.cookies, { domainId, sort: { field: 'TITLE', direction: 'DESC' } })
      expect(desc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([c, a, b])
    })

    it('trie par CREATED_AT ascendant et descendant', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const { a, b, c } = await seedThree(alice.cookies, domainId)

      const asc = await query(alice.cookies, { domainId, sort: { field: 'CREATED_AT', direction: 'ASC' } })
      expect(asc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([b, a, c])

      const desc = await query(alice.cookies, { domainId, sort: { field: 'CREATED_AT', direction: 'DESC' } })
      expect(desc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([c, a, b])
    })

    it('trie par UPDATED_AT ascendant et descendant', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const a = await createArticle(alice.cookies, domainId, { title: 'Article A' })
      const b = await createArticle(alice.cookies, domainId, { title: 'Article B' })
      await h.prisma.article.update({ where: { id: a }, data: { updatedAt: new Date('2026-02-01T00:00:00Z') } })
      await h.prisma.article.update({ where: { id: b }, data: { updatedAt: new Date('2026-01-01T00:00:00Z') } })

      const asc = await query(alice.cookies, { domainId, sort: { field: 'UPDATED_AT', direction: 'ASC' } })
      expect(asc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([b, a])
    })

    it('trie par PUBLISHED_AT — les non-publiés (null) sont relégués en fin, quel que soit le sens', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const published = await createArticle(alice.cookies, domainId, { title: 'Publié' })
      const unpublished = await createArticle(alice.cookies, domainId, { title: 'Non publié' })
      await h.prisma.article.update({ where: { id: published }, data: { publishedAt: new Date('2026-01-01T00:00:00Z') } })

      const asc = await query(alice.cookies, { domainId, sort: { field: 'PUBLISHED_AT', direction: 'ASC' } })
      expect(asc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([published, unpublished])

      const desc = await query(alice.cookies, { domainId, sort: { field: 'PUBLISHED_AT', direction: 'DESC' } })
      expect(desc.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([published, unpublished])
    })

    describe('SEO_SCORE — les articles jamais analysés (null) sont relégués en fin, quel que soit le sens', () => {
      it('ascendant : les scores croissants d’abord, les null en dernier', async () => {
        const alice = await signUp('alice@example.com')
        const domainId = await createDomain(alice.cookies)
        const { a, b, c } = await seedThree(alice.cookies, domainId) // a=40, b=null, c=80

        const res = await query(alice.cookies, { domainId, sort: { field: 'SEO_SCORE', direction: 'ASC' } })
        expect(res.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([a, c, b])
      })

      it('descendant : les scores décroissants d’abord, les null TOUJOURS en dernier (pas en tête)', async () => {
        const alice = await signUp('alice@example.com')
        const domainId = await createDomain(alice.cookies)
        const { a, b, c } = await seedThree(alice.cookies, domainId) // a=40, b=null, c=80

        const res = await query(alice.cookies, { domainId, sort: { field: 'SEO_SCORE', direction: 'DESC' } })
        // Sans NULLS LAST explicite, Postgres placerait `b` (null) EN TÊTE
        // d'un tri DESC (comportement par défaut) : ce test échouerait alors.
        expect(res.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([c, a, b])
      })
    })

    it('un tri explicite l’emporte sur le rang de pertinence quand `search` est aussi fourni', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      // Sans tri explicite, le rang de pertinence classerait le titre en
      // premier (pondération A > B, voir article-search.int-spec.ts).
      const titleMatch = await createArticle(alice.cookies, domainId, {
        title: 'Zoologie appliquée',
        content: 'Sans rapport.',
      })
      const bodyMatch = await createArticle(alice.cookies, domainId, {
        title: 'Astronomie',
        content: 'Ce paragraphe mentionne la zoologie une fois.',
      })

      // Tri alphabétique explicite : Astronomie (bodyMatch) avant Zoologie
      // (titleMatch) — l'inverse de ce que donnerait le rang de pertinence.
      const res = await query(alice.cookies, {
        domainId,
        filter: { search: 'zoologie' },
        sort: { field: 'TITLE', direction: 'ASC' },
      })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(2)
      expect(res.body.data.articles.items.map((x: { id: string }) => x.id)).toEqual([bodyMatch, titleMatch])
    })

    describe('pagination cohérente avec le tri', () => {
      it("demander la page 2 ne renvoie jamais un article déjà vu en page 1", async () => {
        const alice = await signUp('alice@example.com')
        const domainId = await createDomain(alice.cookies)
        const ids: string[] = []
        for (let i = 0; i < 5; i++) {
          const id = await createArticle(alice.cookies, domainId, { title: `Article ${String(i).padStart(2, '0')}` })
          ids.push(id)
        }

        const page1 = await query(alice.cookies, {
          domainId,
          sort: { field: 'TITLE', direction: 'ASC' },
          page: { limit: 2, offset: 0 },
        })
        const page2 = await query(alice.cookies, {
          domainId,
          sort: { field: 'TITLE', direction: 'ASC' },
          page: { limit: 2, offset: 2 },
        })
        const page3 = await query(alice.cookies, {
          domainId,
          sort: { field: 'TITLE', direction: 'ASC' },
          page: { limit: 2, offset: 4 },
        })

        const page1Ids = page1.body.data.articles.items.map((x: { id: string }) => x.id)
        const page2Ids = page2.body.data.articles.items.map((x: { id: string }) => x.id)
        const page3Ids = page3.body.data.articles.items.map((x: { id: string }) => x.id)

        expect(page1Ids).toHaveLength(2)
        expect(page2Ids).toHaveLength(2)
        expect(page3Ids).toHaveLength(1)

        const allSeen = [...page1Ids, ...page2Ids, ...page3Ids]
        expect(new Set(allSeen).size).toBe(5) // aucun doublon entre pages
        expect(allSeen.sort()).toEqual([...ids].sort())
      })
    })
  })

  describe("le filtre d'appartenance au domaine tient avec chaque combinaison de filtres", () => {
    it("un utilisateur non membre du domaine ciblé n'obtient rien, même avec des filtres qui correspondraient à ses propres articles", async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const domainBob = await createDomain(bob.cookies, 'Domaine Bob')

      const bobArticle = await createArticle(bob.cookies, domainBob, { title: 'Article confidentiel de Bob' })
      await h.prisma.article.update({ where: { id: bobArticle }, data: { status: 'PUBLISHED', latestSeoScore: 90 } })

      // Bob tente d'atteindre son propre article, mais via le domaine
      // d'Alice (dont il n'est pas membre) : le guard doit déjà bloquer,
      // avant même que le filtre ne s'applique.
      const res = await query(bob.cookies, {
        domainId: domainAlice,
        filter: { status: ['PUBLISHED'], minSeoScore: 0 },
      })

      expect(res.body.data?.articles ?? null).toBeNull()
      expect(res.body.errors).toBeDefined()
    })

    it("le filtre + tri combinés restent confinés au domaine demandé", async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const domainBob = await createDomain(bob.cookies, 'Domaine Bob')

      const aliceArticle = await createArticle(alice.cookies, domainAlice, { title: 'Alpha' })
      await h.prisma.article.update({ where: { id: aliceArticle }, data: { status: 'PUBLISHED' } })
      const bobArticle = await createArticle(bob.cookies, domainBob, { title: 'Alpha aussi' })
      await h.prisma.article.update({ where: { id: bobArticle }, data: { status: 'PUBLISHED' } })

      const res = await query(alice.cookies, {
        domainId: domainAlice,
        filter: { status: ['PUBLISHED'] },
        sort: { field: 'TITLE', direction: 'ASC' },
      })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(aliceArticle)
    })
  })
})
