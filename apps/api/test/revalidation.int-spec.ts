import { createHarness, Harness } from './app-harness'
import { RevalidationService } from '../src/articles/revalidation.service'

/**
 * Ce que ce test couvre et que le test unitaire ne peut pas couvrir : le
 * SLUG DE DOMAINE réellement transmis au webhook.
 *
 * Les étiquettes de cache côté web sont indexées par slug
 * (`article-public:<domaine>:<article>`), alors que l'article ne porte que
 * `domainId` — d'où la requête supplémentaire de `notifyPublicBlog`. Un test
 * unitaire ne fait que rejouer le double qu'il a lui-même posé : il
 * confirmerait tout aussi bien un `domainId` transmis à la place du slug.
 * Ici, le domaine est réellement créé par la mutation `createDomain`, son
 * slug est dérivé du nom par `slugify`, et c'est CE slug — inconnu du test
 * avant la lecture en base — qui doit ressortir de l'appel.
 *
 * Seul `RevalidationService` est remplacé par un double : il porte le seul
 * appel réseau sortant de l'API, qu'un test d'intégration ne doit surtout pas
 * effectuer pour de vrai (aucun front ne tourne pendant `test:int`).
 */
const notifyArticleChange = jest.fn<Promise<void>, [string, string]>()

let h: Harness
beforeAll(async () => {
  h = await createHarness((builder) =>
    builder.overrideProvider(RevalidationService).useValue({ notifyArticleChange }),
  )
})
afterAll(async () => {
  await h.close()
})
beforeEach(async () => {
  await h.reset()
  notifyArticleChange.mockReset()
  notifyArticleChange.mockResolvedValue(undefined)
})

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id slug } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) {
    createArticle(domainId: $domainId, input: $input) { id slug }
  }`
const SUBMIT = `mutation ($domainId: ID!, $id: ID!) { submitForReview(domainId: $domainId, id: $id) { id status } }`
const APPROVE = `mutation ($domainId: ID!, $id: ID!) { approveArticle(domainId: $domainId, id: $id) { id status } }`
const PUBLISH = `mutation ($domainId: ID!, $id: ID!) { publishArticle(domainId: $domainId, id: $id) { id status } }`
const ARCHIVE = `mutation ($domainId: ID!, $id: ID!) { archiveArticle(domainId: $domainId, id: $id) { id status } }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

/** Un article APPROVED dans un domaine dont le slug est dérivé du nom, prêt à être publié. */
async function approvedArticle() {
  const alice = await signUp('alice@example.com')
  const domaine = await h.gql(CREATE_DOMAIN, { input: { name: 'Cybersécurité Appliquée' } }, alice.cookies)
  const { id: domainId, slug: domainSlug } = domaine.body.data.createDomain

  const article = await h.gql(
    CREATE_ARTICLE,
    { domainId, input: { title: 'Chiffrement de bout en bout', content: '# Titre\n\nUn paragraphe.' } },
    alice.cookies,
  )
  const { id: articleId, slug: articleSlug } = article.body.data.createArticle

  await h.gql(SUBMIT, { domainId, id: articleId }, alice.cookies)
  await h.gql(APPROVE, { domainId, id: articleId }, alice.cookies)

  return { alice, domainId, domainSlug, articleId, articleSlug }
}

describe('revalidation du blog public — bout en bout côté API', () => {
  it('publier notifie le webhook avec le slug du domaine, pas son identifiant', async () => {
    const { alice, domainId, domainSlug, articleId, articleSlug } = await approvedArticle()

    const res = await h.gql(PUBLISH, { domainId, id: articleId }, alice.cookies)

    expect(res.body.data.publishArticle.status).toBe('PUBLISHED')
    expect(notifyArticleChange).toHaveBeenCalledTimes(1)
    expect(notifyArticleChange).toHaveBeenCalledWith(domainSlug, articleSlug)
    // Garde-fou explicite : `domainId` est un cuid, le confondre avec le slug
    // produirait une étiquette qui n'invalide rien et ne signale rien.
    expect(notifyArticleChange.mock.calls[0]?.[0]).not.toBe(domainId)
  })

  it('archiver notifie aussi : une page retirée doit disparaître du blog', async () => {
    const { alice, domainId, domainSlug, articleId, articleSlug } = await approvedArticle()
    await h.gql(PUBLISH, { domainId, id: articleId }, alice.cookies)
    notifyArticleChange.mockClear()

    await h.gql(ARCHIVE, { domainId, id: articleId }, alice.cookies)

    expect(notifyArticleChange).toHaveBeenCalledWith(domainSlug, articleSlug)
  })

  it('un webhook en panne ne fait pas échouer la publication', async () => {
    const { alice, domainId, articleId } = await approvedArticle()
    notifyArticleChange.mockRejectedValue(new Error('ECONNREFUSED web:3001'))

    const res = await h.gql(PUBLISH, { domainId, id: articleId }, alice.cookies)

    // Ni erreur GraphQL, ni transition perdue : la publication est bel et
    // bien écrite en base malgré l'échec de la notification.
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.publishArticle.status).toBe('PUBLISHED')
    const enBase = await h.prisma.article.findUnique({ where: { id: articleId } })
    expect(enBase?.status).toBe('PUBLISHED')
  })

  it("les transitions du back-office ne notifient rien", async () => {
    const alice = await signUp('alice@example.com')
    const domaine = await h.gql(CREATE_DOMAIN, { input: { name: 'Cybersécurité' } }, alice.cookies)
    const domainId = domaine.body.data.createDomain.id
    const article = await h.gql(
      CREATE_ARTICLE,
      { domainId, input: { title: 'Brouillon', content: '# Titre\n\nUn paragraphe.' } },
      alice.cookies,
    )
    const articleId = article.body.data.createArticle.id

    await h.gql(SUBMIT, { domainId, id: articleId }, alice.cookies)
    await h.gql(APPROVE, { domainId, id: articleId }, alice.cookies)

    // DRAFT → REVIEW → APPROVED : rien de tout cela n'est visible du public.
    expect(notifyArticleChange).not.toHaveBeenCalled()
  })
})
