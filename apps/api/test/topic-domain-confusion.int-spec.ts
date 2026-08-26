import { createHarness, Harness } from './app-harness'

/**
 * Les mutations de topics exigent un `domainId` explicite, parce que
 * `DomainRoleGuard` résout le domaine via `args.domainId ?? args.id` et qu'un
 * topic a son propre identifiant.
 *
 * Cela crée un risque de confusion : rien n'oblige structurellement le
 * `domainId` transmis à correspondre au domaine réel du topic ciblé. Un
 * utilisateur légitime sur le domaine A pourrait tenter d'atteindre un topic
 * du domaine B en passant `domainId: A, id: <topic de B>` — le guard validerait
 * son appartenance à A, puis le service travaillerait sur un topic de B.
 *
 * Ces tests vérifient que ce chemin est fermé.
 */

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_TOPIC = `
  mutation ($domainId: ID!, $input: CreateTopicInput!) {
    createTopic(domainId: $domainId, input: $input) { id title }
  }`
const UPDATE_TOPIC = `
  mutation ($domainId: ID!, $id: ID!, $input: UpdateTopicInput!) {
    updateTopic(domainId: $domainId, id: $id, input: $input) { id title }
  }`
const SELECT_TOPIC = `
  mutation ($domainId: ID!, $id: ID!) { selectTopic(domainId: $domainId, id: $id) { id status } }`
const DELETE_TOPIC = `
  mutation ($domainId: ID!, $id: ID!) { deleteTopic(domainId: $domainId, id: $id) }`

const errorCode = (body: any): string =>
  body.errors?.[0]?.extensions?.code ?? body.errors?.[0]?.code

async function signUp(email: string): Promise<string[]> {
  const res = await h.gql(REGISTER, {
    input: { email, password: 'Sup3r-Secret-2026!', name: email.split('@')[0] },
  })
  return res.headers['set-cookie'] as unknown as string[]
}

describe('confusion de domaine sur les topics', () => {
  it("interdit d'atteindre le topic d'un autre domaine via un domainId dont on est membre", async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')

    const domaineAlice = await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)
    const domaineBob = await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)
    const idAlice = domaineAlice.body.data.createDomain.id
    const idBob = domaineBob.body.data.createDomain.id

    const topicBob = await h.gql(
      CREATE_TOPIC,
      { domainId: idBob, input: { title: 'Idée confidentielle de Bob' } },
      bob,
    )
    const idTopicBob = topicBob.body.data.createTopic.id

    // Alice est légitimement OWNER de son domaine. Elle passe SON domainId,
    // mais l'identifiant d'un topic appartenant à Bob.
    const usurpation = await h.gql(
      UPDATE_TOPIC,
      { domainId: idAlice, id: idTopicBob, input: { title: 'Détourné par Alice' } },
      alice,
    )

    expect(usurpation.body.data?.updateTopic).toBeFalsy()
    expect(['FORBIDDEN', 'NOT_FOUND']).toContain(errorCode(usurpation.body))

    const intact = await h.prisma.topic.findUnique({ where: { id: idTopicBob } })
    expect(intact?.title).toBe('Idée confidentielle de Bob')
  })

  it('ferme le même chemin sur selectTopic', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const idAlice = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)).body.data.createDomain.id
    const idBob = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)).body.data.createDomain.id
    const topicBob = await h.gql(CREATE_TOPIC, { domainId: idBob, input: { title: 'Idée de Bob' } }, bob)

    const res = await h.gql(
      SELECT_TOPIC,
      { domainId: idAlice, id: topicBob.body.data.createTopic.id },
      alice,
    )

    expect(res.body.data?.selectTopic).toBeFalsy()
    const intact = await h.prisma.topic.findUnique({ where: { id: topicBob.body.data.createTopic.id } })
    expect(intact?.status).toBe('IDEA')
  })

  it('ferme le même chemin sur deleteTopic', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const idAlice = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Alice' } }, alice)).body.data.createDomain.id
    const idBob = (await h.gql(CREATE_DOMAIN, { input: { name: 'Domaine Bob' } }, bob)).body.data.createDomain.id
    const topicBob = await h.gql(CREATE_TOPIC, { domainId: idBob, input: { title: 'Idée de Bob' } }, bob)

    const res = await h.gql(
      DELETE_TOPIC,
      { domainId: idAlice, id: topicBob.body.data.createTopic.id },
      alice,
    )

    expect(res.body.data?.deleteTopic).toBeFalsy()
    expect(await h.prisma.topic.count()).toBe(1)
  })
})
