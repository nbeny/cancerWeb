
import { createHarness, errorCode, Harness } from './app-harness'

/**
 * Reproduction indépendante de la fuite inter-domaines trouvée par la revue
 * finale du Lot 1.
 *
 * Trois chemins écrivent `Article.categoryId` : `createArticle`,
 * `updateArticle` et `setArticleCategory`. Un seul validait que la catégorie
 * appartient au domaine de l'article. Les deux autres laissaient un membre du
 * domaine A rattacher son article à une catégorie du domaine B, puis lire —
 * via `Article.category`, `parent`, `children`, `articleCount` — toute
 * l'arborescence éditoriale d'un domaine dont il n'est pas membre.
 *
 * Ce test attaque les trois portes.
 */

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_CATEGORY = `
  mutation ($domainId: ID!, $input: CreateCategoryInput!) {
    createCategory(domainId: $domainId, input: $input) { id name }
  }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, {
    input: { email, password: 'Sup3r-Secret-2026!', name: email.split('@')[0] },
  })
  return {
    cookies: res.headers['set-cookie'] as unknown as string[],
    userId: res.body.data.register.user.id,
  }
}

describe('fuite inter-domaines par categoryId', () => {
  it('ferme les trois portes qui écrivent Article.categoryId', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')

    const domaineAlice = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice.cookies)
    ).body.data.createDomain.id
    const domaineBob = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob.cookies)
    ).body.data.createDomain.id

    // Bob range son domaine. Alice n'en est pas membre.
    const categorieBob = (
      await h.gql(
        CREATE_CATEGORY,
        { domainId: domaineBob, input: { name: 'Stratégie confidentielle' } },
        bob.cookies,
      )
    ).body.data.createCategory.id

    // Porte 1 — createArticle
    const creation = await h.gql(
      `mutation ($domainId: ID!, $input: CreateArticleInput!) {
         createArticle(domainId: $domainId, input: $input) { id }
       }`,
      {
        domainId: domaineAlice,
        input: { title: 'Article dAlice', content: 'Contenu.', categoryId: categorieBob },
      },
      alice.cookies,
    )
    expect(creation.body.data?.createArticle).toBeFalsy()
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(errorCode(creation.body))

    // Un article légitime, pour attaquer les deux autres portes.
    const article = await h.prisma.article.create({
      data: {
        domainId: domaineAlice,
        authorId: alice.userId,
        title: 'Article légitime',
        slug: 'article-legitime',
        content: 'Contenu.',
      },
    })

    // Porte 2 — updateArticle
    const miseAJour = await h.gql(
      `mutation ($domainId: ID!, $id: ID!, $input: UpdateArticleInput!) {
         updateArticle(domainId: $domainId, id: $id, input: $input) { id }
       }`,
      { domainId: domaineAlice, id: article.id, input: { categoryId: categorieBob } },
      alice.cookies,
    )
    expect(miseAJour.body.data?.updateArticle).toBeFalsy()
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(errorCode(miseAJour.body))

    // Porte 3 — setArticleCategory (celle qui validait déjà)
    const rattachement = await h.gql(
      `mutation ($domainId: ID!, $articleId: ID!, $categoryId: ID) {
         setArticleCategory(domainId: $domainId, articleId: $articleId, categoryId: $categoryId) { id }
       }`,
      { domainId: domaineAlice, articleId: article.id, categoryId: categorieBob },
      alice.cookies,
    )
    expect(rattachement.body.data?.setArticleCategory).toBeFalsy()

    // Aucune écriture n'a abouti en base, par aucun chemin.
    const enBase = await h.prisma.article.findUnique({ where: { id: article.id } })
    expect(enBase?.categoryId).toBeNull()
    expect(await h.prisma.article.count({ where: { categoryId: categorieBob } })).toBe(0)
  })

  it("n'expose pas une catégorie d'un autre domaine même si la liaison existait déjà en base", async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')

    const domaineAlice = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice.cookies)
    ).body.data.createDomain.id
    const domaineBob = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob.cookies)
    ).body.data.createDomain.id

    const categorieBob = await h.prisma.category.create({
      data: { domainId: domaineBob, name: 'Stratégie confidentielle', slug: 'strategie' },
    })

    // Liaison forcée directement en base : simule une donnée héritée d'avant
    // la correction, ou écrite par un chemin non couvert. La défense en
    // profondeur au niveau du resolver de champ doit tenir malgré tout.
    const article = await h.prisma.article.create({
      data: {
        domainId: domaineAlice,
        authorId: alice.userId,
        title: 'Article dAlice',
        slug: 'article-alice',
        content: 'Contenu.',
        categoryId: categorieBob.id,
      },
    })

    const lecture = await h.gql(
      `query ($domainId: ID!, $id: ID!) {
         article(domainId: $domainId, id: $id) {
           id
           category { id name domainId }
         }
       }`,
      { domainId: domaineAlice, id: article.id },
      alice.cookies,
    )

    expect(lecture.body.data?.article?.category).toBeNull()
    expect(JSON.stringify(lecture.body)).not.toContain('Stratégie confidentielle')
  })
})
