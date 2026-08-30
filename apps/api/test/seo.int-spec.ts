import { createHarness, errorCode, Harness } from './app-harness'
import { SeoService } from '../src/seo/seo.service'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) { createArticle(domainId: $domainId, input: $input) { id slug } }`

const ANALYZE = `
  mutation ($domainId: ID!, $articleId: ID!) {
    analyzeSeo(domainId: $domainId, articleId: $articleId) {
      id score computedAt cappedBy
      issues { code severity message field }
      metrics
    }
  }`

const REPORTS = `
  query ($domainId: ID!, $articleId: ID!, $page: PageInput) {
    seoReports(domainId: $domainId, articleId: $articleId, page: $page) {
      totalCount
      items { id score computedAt metrics issues { code } }
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
): Promise<{ id: string; slug: string }> {
  const input = {
    title: 'Mon article',
    content: '# Titre\n\nUn petit paragraphe de contenu.',
    ...overrides,
  }
  const res = await h.gql(CREATE_ARTICLE, { domainId, input }, cookies)
  if (res.body.errors) throw new Error(`createArticle failed: ${JSON.stringify(res.body.errors)}`)
  return res.body.data.createArticle
}

const METRIC_KEYS_WITH_KEYWORD_AND_READABILITY = [
  'wordCount',
  'h1Count',
  'internalLinkCount',
  'externalLinkCount',
  'imageCount',
  'imageMissingAltCount',
  'seoTitleLength',
  'metaDescriptionLength',
  'keywordDensity',
  'readability',
  'readabilitySupported',
]

describe('SEO persisté (analyzeSeo / seoReports)', () => {
  it('analyzeSeo crée un rapport et met à jour Article.latestSeoScore ; deux analyses successives créent deux rapports, du plus récent au plus ancien', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)
    const article = await createArticle(alice.cookies, domainId)

    const first = await h.gql(ANALYZE, { domainId, articleId: article.id }, alice.cookies)
    expect(first.body.errors).toBeUndefined()
    const firstScore = first.body.data.analyzeSeo.score

    const updated = await h.gql(
      `mutation ($domainId: ID!, $id: ID!, $input: UpdateArticleInput!) {
        updateArticle(domainId: $domainId, id: $id, input: $input) { id }
      }`,
      {
        domainId,
        id: article.id,
        input: {
          seoTitle: 'Un excellent titre SEO bien calibré vraiment',
          metaDescription:
            'Une meta description soigneusement calibrée pour respecter la fourchette de longueur recommandée par les moteurs de recherche modernes.',
          focusKeyword: 'titre',
        },
      },
      alice.cookies,
    )
    expect(updated.body.errors).toBeUndefined()

    const second = await h.gql(ANALYZE, { domainId, articleId: article.id }, alice.cookies)
    expect(second.body.errors).toBeUndefined()
    const secondScore = second.body.data.analyzeSeo.score
    expect(secondScore).not.toBe(firstScore)

    const stored = await h.prisma.article.findUnique({ where: { id: article.id } })
    expect(stored?.latestSeoScore).toBe(secondScore)

    const list = await h.gql(REPORTS, { domainId, articleId: article.id }, alice.cookies)
    expect(list.body.errors).toBeUndefined()
    expect(list.body.data.seoReports.totalCount).toBe(2)
    const scores = list.body.data.seoReports.items.map((r: { score: number }) => r.score)
    expect(scores).toEqual([secondScore, firstScore]) // plus récent en premier
  })

  it('les issues et metrics persistés en Json sont relus correctement (11 clés de métriques)', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)
    const article = await createArticle(alice.cookies, domainId, {
      seoTitle: 'Un excellent titre SEO bien calibré vraiment',
      metaDescription:
        'Une meta description soigneusement calibrée pour respecter la fourchette de longueur recommandée par les moteurs de recherche modernes.',
      focusKeyword: 'titre',
    })

    const res = await h.gql(ANALYZE, { domainId, articleId: article.id }, alice.cookies)
    expect(res.body.errors).toBeUndefined()

    const reportId = res.body.data.analyzeSeo.id
    const stored = await h.prisma.seoReport.findUnique({ where: { id: reportId } })
    expect(stored).not.toBeNull()
    const metrics = stored?.metrics as Record<string, number>
    expect(Object.keys(metrics).sort()).toEqual([...METRIC_KEYS_WITH_KEYWORD_AND_READABILITY].sort())
    expect(Array.isArray(stored?.issues)).toBe(true)

    // Relu via GraphQL également.
    const gqlMetrics = res.body.data.analyzeSeo.metrics as Record<string, number>
    expect(Object.keys(gqlMetrics).sort()).toEqual([...METRIC_KEYS_WITH_KEYWORD_AND_READABILITY].sort())
  })

  it("expose cappedBy en GraphQL : un article sans meta description (sinon soigné) est plafonné à 60 et cappedBy liste la faute", async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)

    // Article par ailleurs soigné (titre, mot-clé, liens, longueur) pour que
    // le score BRUT dépasse largement 60 : seule l'absence de meta
    // description doit expliquer le plafonnement à 60, pas un score
    // naturellement bas. Reprend la même construction que
    // `apps/api/src/seo/analyzer.spec.ts` ("plafonne à 60 exactement un
        // article sans meta description").
    const keywordSentence = 'Cette randonnée est simple et agréable pour toute la famille.'
    const fillerSentence = 'Le chat dort sur le tapis chaud et calme de la maison.'
    const paragraphs = [
      ...Array.from({ length: 4 }, () => keywordSentence),
      ...Array.from({ length: 12 }, () => Array.from({ length: 5 }, () => fillerSentence).join(' ')),
    ]
    const content = [
      '# Randonnée en montagne : le guide complet',
      '',
      'La randonnée est une activité idéale pour se détendre en plein air et découvrir la nature à pied.',
      '',
      '## Bien préparer sa sortie',
      '',
      paragraphs.join('\n\n'),
      '',
      '## Ressources utiles',
      '',
      '[Voir nos conseils](/conseils-randonnee) et [office de tourisme](https://exemple-tourisme.fr)',
    ].join('\n')

    const article = await createArticle(alice.cookies, domainId, {
      title: 'Randonnée en montagne : le guide complet',
      content,
      seoTitle: 'Guide complet de la randonnée en montagne',
      focusKeyword: 'randonnée',
      // metaDescription volontairement absent.
    })

    const res = await h.gql(ANALYZE, { domainId, articleId: article.id }, alice.cookies)
    expect(res.body.errors).toBeUndefined()

    const report = res.body.data.analyzeSeo
    expect(report.score).toBe(60)
    expect(report.cappedBy).toEqual(['META_DESCRIPTION_MISSING'])
    // `cappedBy` dérive des `issues` (voir `apps/api/src/seo/analyzer.ts`,
    // `blockingCodes`, réutilisée par le résolveur) : cohérent avec la liste
    // des issues bloquantes réellement renvoyées, pas une valeur indépendante.
    const blockingIssueCodes = (report.issues as Array<{ code: string; severity: string }>)
      .filter((issue) => issue.severity === 'BLOCKING')
      .map((issue) => issue.code)
    expect(report.cappedBy).toEqual(blockingIssueCodes)
  })

  it('atomicité : un échec après la création du rapport annule aussi celle-ci (transaction)', async () => {
    const alice = await signUp('alice@example.com')
    const domainId = await createDomain(alice.cookies)
    const article = await createArticle(alice.cookies, domainId)

    const seoService = h.app.get(SeoService)
    const spy = jest.spyOn(seoService, 'applyLatestScore').mockImplementationOnce(() => {
      throw new Error('échec injecté pour vérifier l’atomicité')
    })

    try {
      const res = await h.gql(ANALYZE, { domainId, articleId: article.id }, alice.cookies)
      expect(res.body.errors).toBeDefined()

      const reports = await h.prisma.seoReport.findMany({ where: { articleId: article.id } })
      expect(reports).toHaveLength(0) // le rapport créé avant l'échec a bien été annulé

      const stored = await h.prisma.article.findUnique({ where: { id: article.id } })
      expect(stored?.latestSeoScore).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  it('un VIEWER peut lire un rapport ; un AUTHOR peut en déclencher un', async () => {
    const alice = await signUp('alice@example.com')
    const viewer = await signUp('viewer@example.com')
    const author = await signUp('author@example.com')
    const domainId = await createDomain(alice.cookies)
    await h.prisma.domainMember.create({ data: { domainId, userId: viewer.userId, role: 'VIEWER' } })
    await h.prisma.domainMember.create({ data: { domainId, userId: author.userId, role: 'AUTHOR' } })

    const article = await createArticle(alice.cookies, domainId)

    const asAuthor = await h.gql(ANALYZE, { domainId, articleId: article.id }, author.cookies)
    expect(asAuthor.body.errors).toBeUndefined()

    const asViewer = await h.gql(REPORTS, { domainId, articleId: article.id }, viewer.cookies)
    expect(asViewer.body.errors).toBeUndefined()
    expect(asViewer.body.data.seoReports.totalCount).toBe(1)

    const viewerTriggers = await h.gql(ANALYZE, { domainId, articleId: article.id }, viewer.cookies)
    expect(errorCode(viewerTriggers.body)).toBe('FORBIDDEN')
  })

  it("un non-membre du domaine n'accède à rien", async () => {
    const alice = await signUp('alice@example.com')
    const stranger = await signUp('stranger@example.com')
    const domainId = await createDomain(alice.cookies)
    const article = await createArticle(alice.cookies, domainId)

    const analyzeRes = await h.gql(ANALYZE, { domainId, articleId: article.id }, stranger.cookies)
    expect(errorCode(analyzeRes.body)).toBe('NOT_FOUND')

    const reportsRes = await h.gql(REPORTS, { domainId, articleId: article.id }, stranger.cookies)
    expect(errorCode(reportsRes.body)).toBe('NOT_FOUND')
  })

  it("ferme la confusion de domaine : domainId d'un domaine dont on est membre + articleId d'un autre domaine échoue", async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const domainAlice = await createDomain(alice.cookies, 'Domaine Alice')
    const domainBob = await createDomain(bob.cookies, 'Domaine Bob')
    const articleBob = await createArticle(bob.cookies, domainBob)

    const analyzeRes = await h.gql(ANALYZE, { domainId: domainAlice, articleId: articleBob.id }, alice.cookies)
    expect(analyzeRes.body.data?.analyzeSeo).toBeFalsy()
    expect(errorCode(analyzeRes.body)).toBeDefined()

    const reportsRes = await h.gql(REPORTS, { domainId: domainAlice, articleId: articleBob.id }, alice.cookies)
    expect(reportsRes.body.data?.seoReports ?? null).toBeNull()
    expect(errorCode(reportsRes.body)).toBeDefined()

    const reportCount = await h.prisma.seoReport.count({ where: { articleId: articleBob.id } })
    expect(reportCount).toBe(0)
  })

  describe('enrichissement : validité des liens internes', () => {
    it('un lien vers un slug inexistant produit une issue INTERNAL_LINK_BROKEN ; un lien vers un article existant du même domaine n’en produit pas', async () => {
      const alice = await signUp('alice@example.com')
      const domainId = await createDomain(alice.cookies)
      const target = await createArticle(alice.cookies, domainId, { title: 'Article cible' })

      const source = await createArticle(alice.cookies, domainId, {
        title: 'Article source',
        content: `# Titre\n\nVoir [cet article](/articles/${target.slug}) et [celui-ci](/articles/slug-inexistant).`,
      })

      const res = await h.gql(ANALYZE, { domainId, articleId: source.id }, alice.cookies)
      expect(res.body.errors).toBeUndefined()

      const issues = res.body.data.analyzeSeo.issues as Array<{ code: string; message: string }>
      const broken = issues.filter((i) => i.code === 'INTERNAL_LINK_BROKEN')
      expect(broken).toHaveLength(1)
      expect(broken[0]?.message).toContain('slug-inexistant')
      expect(broken.some((i) => i.message.includes(target.slug))).toBe(false)
    })
  })
})
