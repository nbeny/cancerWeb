import { createHarness, errorCode, Harness } from './app-harness'

/**
 * Équivalent, pour les articles, de `topic-domain-confusion.int-spec.ts` :
 * les mutations d'articles (transitions, versions) exigent un `domainId`
 * explicite parce que `DomainRoleGuard` résout le domaine via
 * `args.domainId ?? args.id`, et un article a son propre identifiant.
 *
 * Rien n'oblige structurellement le `domainId` transmis à correspondre au
 * domaine réel de l'article ciblé : un utilisateur légitime sur le domaine A
 * pourrait tenter d'atteindre un article du domaine B en passant
 * `domainId: A, id/articleId: <article de B>` — le guard validerait son
 * appartenance à A, puis le service doit refuser de travailler sur un
 * article de B plutôt que de faire confiance au `domainId` transmis.
 */

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) { createArticle(domainId: $domainId, input: $input) { id } }`
const SUBMIT = `mutation ($domainId: ID!, $id: ID!) { submitForReview(domainId: $domainId, id: $id) { id status } }`
const VERSIONS = `
  query ($domainId: ID!, $articleId: ID!) { articleVersions(domainId: $domainId, articleId: $articleId) { version } }`
const CREATE_VERSION = `
  mutation ($domainId: ID!, $articleId: ID!) {
    createArticleVersion(domainId: $domainId, articleId: $articleId) { version }
  }`
const RESTORE_VERSION = `
  mutation ($domainId: ID!, $articleId: ID!, $version: Int!) {
    restoreArticleVersion(domainId: $domainId, articleId: $articleId, version: $version) { id }
  }`

async function signUp(email: string): Promise<string[]> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret-2026!', name: email.split('@')[0] } })
  return res.headers['set-cookie'] as unknown as string[]
}

const baseArticleInput = { title: 'Article confidentiel', content: '# Titre\n\nContenu confidentiel de Bob.' }

describe('confusion de domaine sur les articles', () => {
  it("interdit de faire transiter l'article d'un autre domaine via un domainId dont on est membre (submitForReview)", async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')

    const idAlice = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)).body.data.createDomain.id
    const idBob = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)).body.data.createDomain.id

    const articleBob = await h.gql(CREATE_ARTICLE, { domainId: idBob, input: baseArticleInput }, bob)
    const idArticleBob = articleBob.body.data.createArticle.id

    // Alice est légitimement OWNER de son propre domaine, mais cible
    // l'identifiant d'un article appartenant à Bob.
    const usurpation = await h.gql(SUBMIT, { domainId: idAlice, id: idArticleBob }, alice)

    expect(usurpation.body.data?.submitForReview).toBeFalsy()
    expect(['FORBIDDEN', 'NOT_FOUND']).toContain(errorCode(usurpation.body))

    const intact = await h.prisma.article.findUnique({ where: { id: idArticleBob } })
    expect(intact?.status).toBe('DRAFT')
  })

  it('ferme le même chemin sur articleVersions (lecture)', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const idAlice = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)).body.data.createDomain.id
    const idBob = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)).body.data.createDomain.id
    const articleBob = await h.gql(CREATE_ARTICLE, { domainId: idBob, input: baseArticleInput }, bob)
    const idArticleBob = articleBob.body.data.createArticle.id

    const res = await h.gql(VERSIONS, { domainId: idAlice, articleId: idArticleBob }, alice)

    expect(res.body.data?.articleVersions ?? null).toBeNull()
    expect(errorCode(res.body)).toBeDefined()
  })

  it('ferme le même chemin sur createArticleVersion', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const idAlice = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)).body.data.createDomain.id
    const idBob = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)).body.data.createDomain.id
    const articleBob = await h.gql(CREATE_ARTICLE, { domainId: idBob, input: baseArticleInput }, bob)
    const idArticleBob = articleBob.body.data.createArticle.id

    const res = await h.gql(CREATE_VERSION, { domainId: idAlice, articleId: idArticleBob }, alice)

    expect(res.body.data?.createArticleVersion).toBeFalsy()
    expect(await h.prisma.articleVersion.count({ where: { articleId: idArticleBob } })).toBe(1) // seule v1 existe
  })

  it('ferme le même chemin sur restoreArticleVersion', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const idAlice = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)).body.data.createDomain.id
    const idBob = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)).body.data.createDomain.id
    const articleBob = await h.gql(CREATE_ARTICLE, { domainId: idBob, input: baseArticleInput }, bob)
    const idArticleBob = articleBob.body.data.createArticle.id

    const res = await h.gql(RESTORE_VERSION, { domainId: idAlice, articleId: idArticleBob, version: 1 }, alice)

    expect(res.body.data?.restoreArticleVersion).toBeFalsy()
    const intact = await h.prisma.article.findUnique({ where: { id: idArticleBob } })
    expect(intact?.content).toBe(baseArticleInput.content)
  })
})
