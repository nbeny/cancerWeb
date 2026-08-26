import { ArticleStatus, DomainRole } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'

/**
 * Garantie centrale du produit : « IA → revue humaine → publication ».
 *
 * Elle ne tient que si un AUTHOR ne peut atteindre PUBLISHED par AUCUN
 * chemin — ni directement, ni en enchaînant des transitions autorisées, ni
 * en restaurant une version, ni en modifiant un article déjà publié.
 *
 * Les tests unitaires vérifient la matrice de transitions ; celui-ci vérifie
 * qu'aucune autre mutation exposée ne contourne cette matrice.
 */

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, {
    input: { email, password: 'Sup3r-Secret-2026!', name: email.split('@')[0] },
  })
  return {
    cookies: res.headers['set-cookie'] as unknown as string[],
    userId: res.body.data.register.user.id,
  }
}

/** Toutes les mutations de transition exposées par le schéma. */
const TRANSITIONS = [
  'submitForReview',
  'approveArticle',
  'rejectArticle',
  'publishArticle',
  'scheduleArticle',
  'archiveArticle',
] as const

describe("un AUTHOR ne peut pas publier", () => {
  it('aucune mutation de transition ne mène un AUTHOR à PUBLISHED, quel que soit le statut de départ', async () => {
    const owner = await signUp('owner@example.com')
    const author = await signUp('author@example.com')

    const domainId = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine éditorial' } }, owner.cookies)
    ).body.data.createDomain.id

    await h.prisma.domainMember.create({
      data: { domainId, userId: author.userId, role: DomainRole.AUTHOR },
    })

    // Pour chaque statut de départ, on tente chaque transition en tant qu'AUTHOR.
    const statuts = Object.values(ArticleStatus)
    const echappees: string[] = []

    for (const depart of statuts) {
      for (const mutation of TRANSITIONS) {
        const article = await h.prisma.article.create({
          data: {
            domainId,
            authorId: author.userId,
            title: `Article ${depart} ${mutation}`,
            slug: `article-${depart}-${mutation}`.toLowerCase(),
            content: 'Contenu de test.',
            status: depart,
          },
        })

        const args =
          mutation === 'scheduleArticle'
            ? '$domainId: ID!, $id: ID!, $scheduledAt: DateTime!'
            : '$domainId: ID!, $id: ID!'
        const call =
          mutation === 'scheduleArticle'
            ? `${mutation}(domainId: $domainId, id: $id, scheduledAt: $scheduledAt)`
            : `${mutation}(domainId: $domainId, id: $id)`

        const variables: Record<string, unknown> = { domainId, id: article.id }
        if (mutation === 'scheduleArticle') {
          variables.scheduledAt = new Date(Date.now() + 86_400_000).toISOString()
        }

        await h.gql(`mutation (${args}) { ${call} { id status } }`, variables, author.cookies)

        const apres = await h.prisma.article.findUnique({ where: { id: article.id } })
        if (apres?.status === ArticleStatus.PUBLISHED && depart !== ArticleStatus.PUBLISHED) {
          echappees.push(`${depart} --${mutation}--> PUBLISHED`)
        }
      }
    }

    expect(echappees).toEqual([])
  })

  it("restaurer une version ne permet pas de changer le statut", async () => {
    const owner = await signUp('owner@example.com')
    const author = await signUp('author@example.com')
    const domainId = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine éditorial' } }, owner.cookies)
    ).body.data.createDomain.id
    await h.prisma.domainMember.create({
      data: { domainId, userId: author.userId, role: DomainRole.AUTHOR },
    })

    const article = await h.prisma.article.create({
      data: {
        domainId,
        authorId: author.userId,
        title: 'Article en revue',
        slug: 'article-en-revue',
        content: 'Contenu initial.',
        status: ArticleStatus.REVIEW,
      },
    })
    await h.prisma.articleVersion.create({
      data: {
        articleId: article.id,
        version: 1,
        title: 'Article en revue',
        content: 'Contenu initial.',
        createdById: author.userId,
      },
    })

    await h.gql(
      `mutation ($domainId: ID!, $articleId: ID!, $version: Int!) {
         restoreArticleVersion(domainId: $domainId, articleId: $articleId, version: $version) { id status }
       }`,
      { domainId, articleId: article.id, version: 1 },
      author.cookies,
    )

    const apres = await h.prisma.article.findUnique({ where: { id: article.id } })
    expect(apres?.status).toBe(ArticleStatus.REVIEW)
  })

  it("refuse explicitement publishArticle à un AUTHOR avec le bon code d'erreur", async () => {
    const owner = await signUp('owner@example.com')
    const author = await signUp('author@example.com')
    const domainId = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine éditorial' } }, owner.cookies)
    ).body.data.createDomain.id
    await h.prisma.domainMember.create({
      data: { domainId, userId: author.userId, role: DomainRole.AUTHOR },
    })

    const article = await h.prisma.article.create({
      data: {
        domainId,
        authorId: author.userId,
        title: 'Article approuvé',
        slug: 'article-approuve',
        content: 'Contenu.',
        status: ArticleStatus.APPROVED,
      },
    })

    const res = await h.gql(
      `mutation ($domainId: ID!, $id: ID!) { publishArticle(domainId: $domainId, id: $id) { id status } }`,
      { domainId, id: article.id },
      author.cookies,
    )

    // FORBIDDEN et non NOT_FOUND : l'article est visible de l'auteur,
    // seule l'action lui est refusée.
    expect(errorCode(res.body)).toBe('FORBIDDEN')
    const apres = await h.prisma.article.findUnique({ where: { id: article.id } })
    expect(apres?.status).toBe(ArticleStatus.APPROVED)
    expect(apres?.publishedAt).toBeNull()
  })
})
