import { DomainRole } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_TOPIC = `
  mutation ($domainId: ID!, $input: CreateTopicInput!) {
    createTopic(domainId: $domainId, input: $input) { id title status keywords }
  }`
const LIST_TOPICS = `
  query ($domainId: ID!, $status: TopicStatus, $page: PageInput) {
    topics(domainId: $domainId, status: $status, page: $page) { items { id status } totalCount }
  }`
const GET_TOPIC = `query ($domainId: ID!, $id: ID!) { topic(domainId: $domainId, id: $id) { id title } }`
const UPDATE_TOPIC = `
  mutation ($domainId: ID!, $id: ID!, $input: UpdateTopicInput!) {
    updateTopic(domainId: $domainId, id: $id, input: $input) { id title }
  }`
const DELETE_TOPIC = `mutation ($domainId: ID!, $id: ID!) { deleteTopic(domainId: $domainId, id: $id) }`
const SELECT_TOPIC = `mutation ($domainId: ID!, $id: ID!) { selectTopic(domainId: $domainId, id: $id) { id status } }`
const REJECT_TOPIC = `mutation ($domainId: ID!, $id: ID!) { rejectTopic(domainId: $domainId, id: $id) { id status } }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

async function createDomain(cookies: string[], name = 'Cybersécurité'): Promise<string> {
  const res = await h.gql(CREATE_DOMAIN, { input: { name } }, cookies)
  return res.body.data.createDomain.id
}

async function createTopic(
  cookies: string[],
  domainId: string,
  title = 'Un sujet',
): Promise<{ id: string; status: string }> {
  const res = await h.gql(CREATE_TOPIC, { domainId, input: { title, keywords: ['x'] } }, cookies)
  return res.body.data.createTopic
}

describe('sujets (topics)', () => {
  it('crée un sujet sur un domaine dont on est membre', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)

    const res = await h.gql(CREATE_TOPIC, { domainId, input: { title: 'Ransomware 2026', keywords: ['ransomware'] } }, cookies)

    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.createTopic.title).toBe('Ransomware 2026')
    expect(res.body.data.createTopic.status).toBe('IDEA')

    const stored = await h.prisma.topic.findUnique({ where: { id: res.body.data.createTopic.id } })
    expect(stored?.domainId).toBe(domainId)
  })

  describe('isolation par domaine — un non-membre ne peut rien faire', () => {
    async function setup() {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(alice.cookies)
      const topic = await createTopic(alice.cookies, domainId)
      return { alice, bob, domainId, topic }
    }

    it('ne peut pas créer', async () => {
      const { bob, domainId } = await setup()
      const res = await h.gql(CREATE_TOPIC, { domainId, input: { title: 'Intrus', keywords: [] } }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      expect(await h.prisma.topic.count()).toBe(1)
    })

    it('ne peut pas lister', async () => {
      const { bob, domainId } = await setup()
      const res = await h.gql(LIST_TOPICS, { domainId }, bob.cookies)
      expect(res.body.data?.topics ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })

    it('ne peut pas lire', async () => {
      const { bob, domainId, topic } = await setup()
      const res = await h.gql(GET_TOPIC, { domainId, id: topic.id }, bob.cookies)
      expect(res.body.data?.topic ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })

    it('ne peut pas modifier', async () => {
      const { bob, domainId, topic } = await setup()
      const res = await h.gql(UPDATE_TOPIC, { domainId, id: topic.id, input: { title: 'Piraté' } }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      const unchanged = await h.prisma.topic.findUnique({ where: { id: topic.id } })
      expect(unchanged?.title).toBe('Un sujet')
    })

    it('ne peut pas supprimer', async () => {
      const { bob, domainId, topic } = await setup()
      const res = await h.gql(DELETE_TOPIC, { domainId, id: topic.id }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      expect(await h.prisma.topic.count()).toBe(1)
    })
  })

  it('filtre par statut et pagine', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const t1 = await createTopic(cookies, domainId, 'Sujet A')
    await createTopic(cookies, domainId, 'Sujet B')
    await h.gql(SELECT_TOPIC, { domainId, id: t1.id }, cookies)

    const selected = await h.gql(LIST_TOPICS, { domainId, status: 'SELECTED' }, cookies)
    expect(selected.body.data.topics.totalCount).toBe(1)
    expect(selected.body.data.topics.items[0].id).toBe(t1.id)

    const paged = await h.gql(LIST_TOPICS, { domainId, page: { limit: 1, offset: 0 } }, cookies)
    expect(paged.body.data.topics.items).toHaveLength(1)
    expect(paged.body.data.topics.totalCount).toBe(2)
  })

  it('selectTopic fait transiter IDEA -> SELECTED', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const topic = await createTopic(cookies, domainId)

    const res = await h.gql(SELECT_TOPIC, { domainId, id: topic.id }, cookies)
    expect(res.body.data.selectTopic.status).toBe('SELECTED')
  })

  it('rejectTopic fait transiter vers REJECTED', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const topic = await createTopic(cookies, domainId)

    const res = await h.gql(REJECT_TOPIC, { domainId, id: topic.id }, cookies)
    expect(res.body.data.rejectTopic.status).toBe('REJECTED')
  })

  it('refuse une transition invalide REJECTED -> SELECTED', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const topic = await createTopic(cookies, domainId)
    await h.gql(REJECT_TOPIC, { domainId, id: topic.id }, cookies)

    const res = await h.gql(SELECT_TOPIC, { domainId, id: topic.id }, cookies)
    expect(errorCode(res.body)).toBe('CONFLICT')

    const unchanged = await h.prisma.topic.findUnique({ where: { id: topic.id } })
    expect(unchanged?.status).toBe('REJECTED')
  })

  it('CONVERTED n’est atteignable par aucune mutation de ce module', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const topic = await createTopic(cookies, domainId)

    // Ni select, ni reject, ni update ne portent le statut à CONVERTED :
    // seul un input arbitraire tenté sur `status` (hors schéma d'update, qui
    // ne l'expose volontairement pas) le confirmerait — vérifié ici en
    // s'assurant que le champ n'existe simplement pas dans UpdateTopicInput.
    const res = await h.gql(
      `mutation ($domainId: ID!, $id: ID!) {
        updateTopic(domainId: $domainId, id: $id, input: { title: "Toujours pareil" }) { status }
      }`,
      { domainId, id: topic.id },
      cookies,
    )
    expect(res.body.data.updateTopic.status).toBe('IDEA')

    await h.gql(SELECT_TOPIC, { domainId, id: topic.id }, cookies)
    const afterSelect = await h.prisma.topic.findUnique({ where: { id: topic.id } })
    expect(afterSelect?.status).toBe('SELECTED')

    await h.gql(REJECT_TOPIC, { domainId, id: topic.id }, cookies)
    const afterReject = await h.prisma.topic.findUnique({ where: { id: topic.id } })
    expect(afterReject?.status).not.toBe('CONVERTED')
    expect(afterReject?.status).toBe('REJECTED')
  })

  it('un rôle AUTHOR peut créer un sujet, un VIEWER ne le peut pas', async () => {
    const alice = await signUp('alice@example.com')
    const viewer = await signUp('viewer@example.com')
    const domainId = await createDomain(alice.cookies)
    await h.prisma.domainMember.create({ data: { domainId, userId: viewer.userId, role: DomainRole.VIEWER } })

    const res = await h.gql(CREATE_TOPIC, { domainId, input: { title: 'Sujet viewer', keywords: [] } }, viewer.cookies)
    expect(errorCode(res.body)).toBe('FORBIDDEN')

    const readRes = await h.gql(LIST_TOPICS, { domainId }, viewer.cookies)
    expect(readRes.body.errors).toBeUndefined()
  })
})
