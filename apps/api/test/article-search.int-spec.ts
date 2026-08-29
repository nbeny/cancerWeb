import { createHarness, Harness } from './app-harness'

/**
 * Task 10 — recherche plein texte (`Article.searchVector`, colonne générée
 * jamais utilisée avant cette tâche : pondération titre `A` / contenu `B`,
 * dictionnaire `simple`).
 */

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) { createArticle(domainId: $domainId, input: $input) { id title } }`
const SEARCH = `
  query ($domainId: ID!, $filter: ArticleFilter) {
    articles(domainId: $domainId, filter: $filter) { totalCount items { id title } }
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
    content: 'Un contenu par défaut, sans intérêt particulier pour la recherche.',
    ...overrides,
  }
  const res = await h.gql(CREATE_ARTICLE, { domainId, input }, cookies)
  if (res.body.errors) throw new Error(`createArticle failed: ${JSON.stringify(res.body.errors)}`)
  return res.body.data.createArticle.id
}

async function search(cookies: string[], domainId: string, term: string) {
  return h.gql(SEARCH, { domainId, filter: { search: term } }, cookies)
}

describe('recherche plein texte (Article.searchVector)', () => {
  it('un mot du titre fait remonter l’article', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)
    const id = await createArticle(alice.cookies, domainId, { title: 'La cryptographie quantique expliquée' })

    const res = await search(alice.cookies, domainId, 'cryptographie')
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.articles.totalCount).toBe(1)
    expect(res.body.data.articles.items[0].id).toBe(id)
  })

  it('un mot du corps fait remonter l’article, avec un rang inférieur à une correspondance de titre (pondération A vs B)', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)

    const titleMatch = await createArticle(alice.cookies, domainId, {
      title: 'La photosynthèse en détail',
      content: 'Explication générale, sans rapport avec le mot recherché ailleurs.',
    })
    const bodyMatch = await createArticle(alice.cookies, domainId, {
      title: 'Un article sans rapport apparent',
      content: 'Ce paragraphe mentionne la photosynthèse une seule fois, en passant.',
    })

    const res = await search(alice.cookies, domainId, 'photosynthèse')
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.articles.totalCount).toBe(2)
    const ids = res.body.data.articles.items.map((a: { id: string }) => a.id)
    // Correspondance de titre (poids A) classée avant correspondance de corps (poids B).
    expect(ids).toEqual([titleMatch, bodyMatch])
  })

  it('une recherche sans correspondance renvoie une liste vide, sans erreur', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)
    await createArticle(alice.cookies, domainId)

    const res = await search(alice.cookies, domainId, 'zzzsansaucunematchpossiblezzz')
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.articles.totalCount).toBe(0)
    expect(res.body.data.articles.items).toEqual([])
  })

  describe('caractères dangereux : aucune erreur, aucun résultat aberrant, aucune injection', () => {
    const DANGEROUS_INPUTS = [`'`, `%`, `;`, `--`, `' OR 1=1 --`, `\\`]

    it.each(DANGEROUS_INPUTS)('terme %j', async (term) => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      await createArticle(alice.cookies, domainId, { title: 'Article normal', content: 'Contenu normal.' })

      const res = await search(alice.cookies, domainId, term)
      expect(res.body.errors).toBeUndefined()
      // `' OR 1=1 --` ne doit surtout pas se comporter comme une clause SQL
      // qui ferait remonter TOUS les articles : le paramètre est lié, jamais
      // interprété comme du SQL.
      expect(res.body.data.articles.totalCount).toBe(0)
    })

    it("une table Article non vide sur plusieurs domaines n'est jamais entièrement exposée par une tentative d'injection", async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      for (let i = 0; i < 5; i++) {
        await createArticle(alice.cookies, domainId, { title: `Article ${i}`, content: `Contenu ${i}` })
      }

      const res = await search(alice.cookies, domainId, "' OR 1=1 --")
      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(0) // pas les 5 articles du domaine
    })
  })

  it("reste confinée aux domaines dont l'utilisateur est membre", async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const domainAlice = await createDomain(alice.cookies, 'Domaine Alice')
    const domainBob = await createDomain(bob.cookies, 'Domaine Bob')

    await createArticle(bob.cookies, domainBob, {
      title: 'Article de Bob',
      content: 'Ce contenu mentionne le mot-clé exclusif zibulon.',
    })
    await createArticle(alice.cookies, domainAlice, { title: 'Article d’Alice', content: 'Rien à voir.' })

    const res = await search(alice.cookies, domainAlice, 'zibulon')
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.articles.totalCount).toBe(0)
  })

  describe('accents (dictionnaire "simple", pas de désaccentuation)', () => {
    it('une recherche accentuée correspond à un contenu accentué', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const id = await createArticle(alice.cookies, domainId, {
        title: 'Un guide de sécurité informatique',
        content: 'Contenu générique.',
      })

      const res = await search(alice.cookies, domainId, 'sécurité')
      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(1)
      expect(res.body.data.articles.items[0].id).toBe(id)
    })

    // Comportement documenté et assumé : le dictionnaire `simple` ne fait
    // aucune désaccentuation (contrairement à un dictionnaire `unaccent`,
    // non configuré ici). Une recherche non accentuée ne retrouve donc PAS
    // un contenu accentué : "securite" ≠ "sécurité" pour Postgres.
    it('une recherche non accentuée NE correspond PAS à un contenu accentué (comportement assumé)', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      await createArticle(alice.cookies, domainId, {
        title: 'Un guide de sécurité informatique',
        content: 'Contenu générique.',
      })

      const res = await search(alice.cookies, domainId, 'securite')
      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.articles.totalCount).toBe(0)
    })
  })
})
