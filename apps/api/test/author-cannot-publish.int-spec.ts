import { ArticleStatus, DomainRole } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'
import { canTransition } from '../src/articles/transitions'

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
type TransitionMutation = (typeof TRANSITIONS)[number]

/** Le statut cible fixe de chaque mutation (indépendant du statut de départ). */
const TARGET_STATUS: Record<TransitionMutation, ArticleStatus> = {
  submitForReview: ArticleStatus.REVIEW,
  approveArticle: ArticleStatus.APPROVED,
  rejectArticle: ArticleStatus.DRAFT,
  publishArticle: ArticleStatus.PUBLISHED,
  scheduleArticle: ArticleStatus.SCHEDULED,
  archiveArticle: ArticleStatus.ARCHIVED,
}

interface MatrixResult {
  depart: ArticleStatus
  mutation: TransitionMutation
  /** Code d'erreur GraphQL, `undefined` si la mutation a réussi. */
  code: string | undefined
  finalStatus: ArticleStatus | undefined
}

/**
 * Rejoue les 36 couples (statut de départ × mutation de transition) pour UN
 * rôle donné et retourne, pour chacun, le code d'erreur obtenu (ou
 * `undefined` en cas de succès) et le statut final réellement observé en
 * base. Factorisé pour être rejoué à l'identique avec un AUTHOR (Correction
 * 3b : la matrice ne doit jamais passer sans avoir vraiment atteint le
 * resolver) et avec un EDITOR (contrôle positif : la même mécanique doit
 * pouvoir détecter un succès, pas seulement des échecs).
 */
async function runTransitionMatrix(domainId: string, authorId: string, cookies: string[], tag: string): Promise<MatrixResult[]> {
  const statuts = Object.values(ArticleStatus)
  const results: MatrixResult[] = []

  for (const depart of statuts) {
    for (const mutation of TRANSITIONS) {
      const article = await h.prisma.article.create({
        data: {
          domainId,
          authorId,
          title: `Article ${depart} ${mutation}`,
          slug: `article-${tag}-${depart}-${mutation}`.toLowerCase(),
          content: 'Contenu de test.',
          status: depart,
        },
      })

      const args =
        mutation === 'scheduleArticle' ? '$domainId: ID!, $id: ID!, $scheduledAt: DateTime!' : '$domainId: ID!, $id: ID!'
      const call =
        mutation === 'scheduleArticle'
          ? `${mutation}(domainId: $domainId, id: $id, scheduledAt: $scheduledAt)`
          : `${mutation}(domainId: $domainId, id: $id)`

      const variables: Record<string, unknown> = { domainId, id: article.id }
      if (mutation === 'scheduleArticle') {
        variables.scheduledAt = new Date(Date.now() + 86_400_000).toISOString()
      }

      const res = await h.gql(`mutation (${args}) { ${call} { id status } }`, variables, cookies)
      const apres = await h.prisma.article.findUnique({ where: { id: article.id } })

      results.push({ depart, mutation, code: errorCode(res.body), finalStatus: apres?.status })
    }
  }

  return results
}

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

    const results = await runTransitionMatrix(domainId, author.userId, author.cookies, 'author')

    for (const r of results) {
      const attendu = canTransition(r.depart, TARGET_STATUS[r.mutation], DomainRole.AUTHOR)
      if (attendu.allowed) {
        // Seul cas légitime pour un AUTHOR dans toute la matrice : DRAFT
        // -> REVIEW via submitForReview. La requête doit avoir réellement
        // réussi (aucune erreur), pas seulement "ne pas avoir échoué avec le
        // mauvais code".
        expect(r.code).toBeUndefined()
      } else {
        // Le contrôle qui prouve que la requête a bien atteint le resolver
        // (et non échoué en validation GraphQL AVANT lui, ce qui rendrait la
        // matrice vacuously verte quelle que soit la vraie autorisation) :
        // le code doit être un refus MÉTIER, jamais
        // `GRAPHQL_VALIDATION_FAILED` (mutation renommée, argument
        // mal interpolé, type changé...).
        expect(['FORBIDDEN', 'NOT_FOUND']).toContain(r.code)
      }
    }

    const echappees = results
      .filter((r) => r.finalStatus === ArticleStatus.PUBLISHED && r.depart !== ArticleStatus.PUBLISHED)
      .map((r) => `${r.depart} --${r.mutation}--> PUBLISHED`)
    expect(echappees).toEqual([])
  })

  it('contrôle positif : la même matrice, rejouée avec un EDITOR, produit bien des publications observables', async () => {
    // Sans ce test, rien ne prouve que `runTransitionMatrix` (et donc le
    // test précédent) est capable de détecter un SUCCÈS : une matrice qui
    // échouerait systématiquement à atteindre le resolver (mutation
    // renommée, harnais cassé...) passerait le test AUTHOR au vert pour la
    // mauvaise raison. Un EDITOR a le rang requis pour publier
    // (APPROVED/SCHEDULED -> PUBLISHED) : la matrice DOIT observer au moins
    // ces publications.
    const owner = await signUp('owner-positif@example.com')
    const editor = await signUp('editor-positif@example.com')

    const domainId = (
      await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine éditorial (contrôle positif)' } }, owner.cookies)
    ).body.data.createDomain.id

    await h.prisma.domainMember.create({
      data: { domainId, userId: editor.userId, role: DomainRole.EDITOR },
    })

    const results = await runTransitionMatrix(domainId, editor.userId, editor.cookies, 'editor')

    for (const r of results) {
      const attendu = canTransition(r.depart, TARGET_STATUS[r.mutation], DomainRole.EDITOR)
      if (attendu.allowed) {
        expect(r.code).toBeUndefined()
        expect(r.finalStatus).toBe(TARGET_STATUS[r.mutation])
      } else {
        expect(['FORBIDDEN', 'NOT_FOUND']).toContain(r.code)
      }
    }

    const publications = results.filter((r) => r.finalStatus === ArticleStatus.PUBLISHED)
    // Preuve que le harnais sait détecter un succès, pas seulement des échecs.
    expect(publications.length).toBeGreaterThan(0)
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
        // Contenu COURANT de l'article, volontairement distinct de celui de
        // v1 ci-dessous : avec le même contenu aux deux endroits, une
        // restauration réussie et une restauration refusée sont
        // indiscernables (l'état final serait identique dans les deux cas).
        content: 'Contenu courant de l’article, après la création de v1.',
        status: ArticleStatus.REVIEW,
      },
    })
    await h.prisma.articleVersion.create({
      data: {
        articleId: article.id,
        version: 1,
        title: 'Article en revue (titre de v1)',
        content: 'Contenu de v1, différent du contenu courant de l’article.',
        createdById: author.userId,
      },
    })

    const res = await h.gql(
      `mutation ($domainId: ID!, $articleId: ID!, $version: Int!) {
         restoreArticleVersion(domainId: $domainId, articleId: $articleId, version: $version) { id status content }
       }`,
      { domainId, articleId: article.id, version: 1 },
      author.cookies,
    )

    // `restoreArticleVersion` est autorisé à un AUTHOR (c'est une variante de
    // `update()`, pas une transition de workflow) : la restauration doit
    // avoir RÉELLEMENT eu lieu — le contenu doit être celui de v1 — pour que
    // l'assertion suivante sur le statut soit une preuve, et non une
    // coïncidence.
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.restoreArticleVersion.content).toBe('Contenu de v1, différent du contenu courant de l’article.')

    const apres = await h.prisma.article.findUnique({ where: { id: article.id } })
    expect(apres?.content).toBe('Contenu de v1, différent du contenu courant de l’article.')
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
