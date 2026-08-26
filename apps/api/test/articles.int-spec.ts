import { DomainRole } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_TOPIC = `
  mutation ($domainId: ID!, $input: CreateTopicInput!) { createTopic(domainId: $domainId, input: $input) { id status } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) {
    createArticle(domainId: $domainId, input: $input) {
      id title slug content renderedHtml wordCount topicId status
    }
  }`
const LIST_ARTICLES = `
  query ($domainId: ID!, $page: PageInput) { articles(domainId: $domainId, page: $page) { items { id } totalCount } }`
const GET_ARTICLE = `query ($domainId: ID!, $id: ID!) { article(domainId: $domainId, id: $id) { id title } }`
const UPDATE_ARTICLE = `
  mutation ($domainId: ID!, $id: ID!, $input: UpdateArticleInput!) {
    updateArticle(domainId: $domainId, id: $id, input: $input) { id title content renderedHtml wordCount }
  }`
const DELETE_ARTICLE = `mutation ($domainId: ID!, $id: ID!) { deleteArticle(domainId: $domainId, id: $id) }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

async function createDomain(cookies: string[], name = 'Cybersécurité'): Promise<string> {
  const res = await h.gql(CREATE_DOMAIN, { input: { name } }, cookies)
  return res.body.data.createDomain.id
}

async function createTopic(cookies: string[], domainId: string, title = 'Un sujet'): Promise<string> {
  const res = await h.gql(CREATE_TOPIC, { domainId, input: { title, keywords: [] } }, cookies)
  return res.body.data.createTopic.id
}

const baseArticleInput = (overrides: Record<string, unknown> = {}) => ({
  title: 'Mon article',
  content: '# Titre\n\nUn petit paragraphe de contenu.',
  ...overrides,
})

describe('articles', () => {
  describe('création depuis un sujet', () => {
    it('lie l’article au sujet et fait passer le sujet à CONVERTED (transaction)', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const topicId = await createTopic(cookies, domainId)

      const res = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput({ topicId }) }, cookies)

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.createArticle.topicId).toBe(topicId)

      const topic = await h.prisma.topic.findUnique({ where: { id: topicId } })
      expect(topic?.status).toBe('CONVERTED')
    })

    it('un échec de création laisse le sujet intact (rollback de la transaction)', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const topicId = await createTopic(cookies, domainId)

      // `categoryId` pointe vers une catégorie inexistante : la contrainte de
      // clé étrangère échoue au moment de `article.create`, APRÈS que le
      // sujet a déjà été marqué CONVERTED dans la même transaction. Si la
      // transaction est bien atomique, ce marquage doit être annulé.
      const res = await h.gql(
        CREATE_ARTICLE,
        { domainId, input: baseArticleInput({ topicId, categoryId: 'categorie-inexistante-000000' }) },
        cookies,
      )

      expect(res.body.errors).toBeDefined()

      const topic = await h.prisma.topic.findUnique({ where: { id: topicId } })
      expect(topic?.status).toBe('IDEA')
      expect(await h.prisma.article.count()).toBe(0)
    })

    it('refuse un second article depuis le même sujet (CONFLICT, pas une erreur Prisma brute)', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const topicId = await createTopic(cookies, domainId)

      const first = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput({ topicId }) }, cookies)
      expect(first.body.errors).toBeUndefined()

      const second = await h.gql(
        CREATE_ARTICLE,
        { domainId, input: baseArticleInput({ topicId, title: 'Autre titre' }) },
        cookies,
      )

      expect(errorCode(second.body)).toBe('CONFLICT')
      const message = second.body.errors?.[0]?.message as string
      expect(message).not.toMatch(/prisma|PrismaClient|P20\d\d/i)
      expect(await h.prisma.article.count()).toBe(1)
    })
  })

  it('autorise la création sans sujet', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)

    const res = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput() }, cookies)

    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.createArticle.topicId).toBeNull()
  })

  describe('slug unique par domaine', () => {
    it('ajoute un suffixe en cas de collision dans le même domaine, mais pas dans un autre domaine', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainA = await createDomain(cookies, 'Domaine A')
      const domainB = await createDomain(cookies, 'Domaine B')

      const first = await h.gql(CREATE_ARTICLE, { domainId: domainA, input: baseArticleInput({ title: 'Mon Article' }) }, cookies)
      const second = await h.gql(CREATE_ARTICLE, { domainId: domainA, input: baseArticleInput({ title: 'Mon Article' }) }, cookies)
      const third = await h.gql(CREATE_ARTICLE, { domainId: domainB, input: baseArticleInput({ title: 'Mon Article' }) }, cookies)

      expect(first.body.data.createArticle.slug).toBe('mon-article')
      expect(second.body.data.createArticle.slug).toBe('mon-article-1')
      expect(third.body.data.createArticle.slug).toBe('mon-article')
    })
  })

  describe('wordCount et renderedHtml sont des valeurs dérivées', () => {
    it('sont calculés à la création à partir du contenu', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)

      const res = await h.gql(
        CREATE_ARTICLE,
        { domainId, input: baseArticleInput({ content: '# Titre\n\nUn deux trois quatre cinq.' }) },
        cookies,
      )

      expect(res.body.data.createArticle.wordCount).toBe(6) // "Titre" + 5 mots
      expect(res.body.data.createArticle.renderedHtml).toContain('<h1>')
      expect(res.body.data.createArticle.renderedHtml).toContain('<p>')
    })

    it('sont recalculés quand le contenu est réécrit, et inchangés sinon', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const created = await h.gql(
        CREATE_ARTICLE,
        { domainId, input: baseArticleInput({ content: 'Un deux trois.' }) },
        cookies,
      )
      const id = created.body.data.createArticle.id
      const originalWordCount = created.body.data.createArticle.wordCount
      const originalHtml = created.body.data.createArticle.renderedHtml

      const titleOnly = await h.gql(UPDATE_ARTICLE, { domainId, id, input: { title: 'Nouveau titre' } }, cookies)
      expect(titleOnly.body.data.updateArticle.wordCount).toBe(originalWordCount)
      expect(titleOnly.body.data.updateArticle.renderedHtml).toBe(originalHtml)

      const contentUpdate = await h.gql(
        UPDATE_ARTICLE,
        { domainId, id, input: { content: 'Un deux trois quatre cinq six sept.' } },
        cookies,
      )
      expect(contentUpdate.body.data.updateArticle.wordCount).toBe(7)
      expect(contentUpdate.body.data.updateArticle.wordCount).not.toBe(originalWordCount)

      const stored = await h.prisma.article.findUnique({ where: { id } })
      expect(stored?.wordCount).toBe(7)
      expect(stored?.renderedHtml).toBe(contentUpdate.body.data.updateArticle.renderedHtml)
    })
  })

  it('renderedHtml ne contient jamais de <script>, même si le Markdown en contient', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)

    const res = await h.gql(
      CREATE_ARTICLE,
      { domainId, input: baseArticleInput({ content: 'Texte.\n\n<script>alert(1)</script>\n\nSuite.' }) },
      cookies,
    )

    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.createArticle.renderedHtml).not.toMatch(/<script/i)
    expect(res.body.data.createArticle.renderedHtml).not.toContain('alert(1)')

    const stored = await h.prisma.article.findUnique({ where: { id: res.body.data.createArticle.id } })
    expect(stored?.renderedHtml).not.toMatch(/<script/i)
  })

  describe('autorisation par rôle', () => {
    it('un AUTHOR ne modifie pas l’article d’un autre auteur', async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(alice.cookies)
      await h.prisma.domainMember.create({ data: { domainId, userId: bob.userId, role: DomainRole.AUTHOR } })

      const created = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput() }, alice.cookies)
      const id = created.body.data.createArticle.id

      const res = await h.gql(UPDATE_ARTICLE, { domainId, id, input: { title: 'Piraté par Bob' } }, bob.cookies)
      expect(errorCode(res.body)).toBe('FORBIDDEN')

      const unchanged = await h.prisma.article.findUnique({ where: { id } })
      expect(unchanged?.title).toBe('Mon article')
    })

    it('un EDITOR peut modifier l’article d’un autre auteur', async () => {
      const alice = await signUp('alice@example.com')
      const dan = await signUp('dan@example.com')
      const domainId = await createDomain(alice.cookies)
      await h.prisma.domainMember.create({ data: { domainId, userId: dan.userId, role: DomainRole.EDITOR } })

      const created = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput() }, alice.cookies)
      const id = created.body.data.createArticle.id

      const res = await h.gql(UPDATE_ARTICLE, { domainId, id, input: { title: 'Édité par Dan' } }, dan.cookies)
      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.updateArticle.title).toBe('Édité par Dan')
    })

    it('la suppression est réservée à OWNER', async () => {
      const alice = await signUp('alice@example.com')
      const dan = await signUp('dan@example.com')
      const domainId = await createDomain(alice.cookies)
      await h.prisma.domainMember.create({ data: { domainId, userId: dan.userId, role: DomainRole.EDITOR } })

      const created = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput() }, alice.cookies)
      const id = created.body.data.createArticle.id

      const editorAttempt = await h.gql(DELETE_ARTICLE, { domainId, id }, dan.cookies)
      expect(errorCode(editorAttempt.body)).toBe('FORBIDDEN')
      expect(await h.prisma.article.count()).toBe(1)

      const ownerAttempt = await h.gql(DELETE_ARTICLE, { domainId, id }, alice.cookies)
      expect(ownerAttempt.body.data.deleteArticle).toBe(true)
      expect(await h.prisma.article.count()).toBe(0)
    })
  })

  describe('isolation par domaine — un non-membre n’accède à rien', () => {
    async function setup() {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(alice.cookies)
      const created = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput() }, alice.cookies)
      return { alice, bob, domainId, articleId: created.body.data.createArticle.id as string }
    }

    it('ne peut pas créer', async () => {
      const { bob, domainId } = await setup()
      const res = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput({ title: 'Intrus' }) }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      expect(await h.prisma.article.count()).toBe(1)
    })

    it('ne peut pas lister', async () => {
      const { bob, domainId } = await setup()
      const res = await h.gql(LIST_ARTICLES, { domainId }, bob.cookies)
      expect(res.body.data?.articles ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })

    it('ne peut pas lire', async () => {
      const { bob, domainId, articleId } = await setup()
      const res = await h.gql(GET_ARTICLE, { domainId, id: articleId }, bob.cookies)
      expect(res.body.data?.article ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })

    it('ne peut pas modifier', async () => {
      const { bob, domainId, articleId } = await setup()
      const res = await h.gql(UPDATE_ARTICLE, { domainId, id: articleId, input: { title: 'Piraté' } }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      const unchanged = await h.prisma.article.findUnique({ where: { id: articleId } })
      expect(unchanged?.title).toBe('Mon article')
    })

    it('ne peut pas supprimer', async () => {
      const { bob, domainId, articleId } = await setup()
      const res = await h.gql(DELETE_ARTICLE, { domainId, id: articleId }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      expect(await h.prisma.article.count()).toBe(1)
    })
  })
})
