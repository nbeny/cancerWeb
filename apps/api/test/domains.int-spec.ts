import { createHarness, errorCode, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE = `
  mutation ($input: CreateDomainInput!) {
    createDomain(input: $input) { id name slug language tone autoPublish country }
  }`
const LIST = `{ domains { items { id name slug } totalCount } }`
const UPDATE = `
  mutation ($id: ID!, $input: UpdateDomainInput!) {
    updateDomain(id: $id, input: $input) { id name description }
  }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

describe('domaines', () => {
  it('crée un domaine et rend son créateur OWNER', async () => {
    const { cookies, userId } = await signUp('alice@example.com')
    const res = await h.gql(CREATE, { input: { name: 'Cybersécurité', language: 'fr' } }, cookies)

    expect(res.body.data.createDomain.slug).toBe('cybersecurite')
    expect(res.body.data.createDomain.autoPublish).toBe(false)

    const member = await h.prisma.domainMember.findFirst({ where: { userId } })
    expect(member?.role).toBe('OWNER')
  })

  it('rend le slug unique en cas de collision', async () => {
    const { cookies } = await signUp('alice@example.com')
    const first = await h.gql(CREATE, { input: { name: 'Cybersécurité' } }, cookies)
    const second = await h.gql(CREATE, { input: { name: 'Cybersécurité' } }, cookies)
    expect(first.body.data.createDomain.slug).toBe('cybersecurite')
    expect(second.body.data.createDomain.slug).toBe('cybersecurite-1')
  })

  it('ne liste que les domaines dont l’utilisateur est membre', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    await h.gql(CREATE, { input: { name: 'Domaine Bob' } }, bob.cookies)

    const res = await h.gql(LIST, {}, alice.cookies)
    expect(res.body.data.domains.totalCount).toBe(1)
    expect(res.body.data.domains.items[0].name).toBe('Domaine Alice')
  })

  it('refuse la création sans authentification', async () => {
    const res = await h.gql(CREATE, { input: { name: 'Anonyme' } })
    expect(res.body.errors).toBeDefined()
    expect(await h.prisma.domain.count()).toBe(0)
  })

  it('refuse un nom vide', async () => {
    const { cookies } = await signUp('alice@example.com')
    const res = await h.gql(CREATE, { input: { name: '' } }, cookies)
    expect(res.body.errors).toBeDefined()
  })

  describe('country (ISO 3166-1 alpha-2)', () => {
    it('normalise un code pays valide en majuscules', async () => {
      const { cookies } = await signUp('alice@example.com')
      const res = await h.gql(CREATE, { input: { name: 'Cybersécurité', country: 'fr' } }, cookies)
      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.createDomain.country).toBe('FR')
    })

    it('refuse un code qui ressemble à un code pays mais n’en est pas un', async () => {
      const { cookies } = await signUp('alice@example.com')
      const res = await h.gql(CREATE, { input: { name: 'Cybersécurité', country: 'ZZ' } }, cookies)
      expect(res.body.errors).toBeDefined()
      expect(await h.prisma.domain.count()).toBe(0)
    })
  })

  describe('updateDomain avec un null explicite', () => {
    async function createDomain(cookies: string[]): Promise<string> {
      const res = await h.gql(CREATE, { input: { name: 'Cybersécurité' } }, cookies)
      return res.body.data.createDomain.id
    }

    it('rejette proprement un champ non-effaçable mis à null (VALIDATION_FAILED, pas une erreur interne)', async () => {
      const { cookies } = await signUp('alice@example.com')
      const id = await createDomain(cookies)

      const res = await h.gql(UPDATE, { id, input: { name: null } }, cookies)

      expect(res.body.data?.updateDomain ?? null).toBeNull()
      expect(errorCode(res.body)).toBe('VALIDATION_FAILED')
    })

    it('accepte un null explicite sur un champ effaçable et met la valeur à null', async () => {
      const { cookies } = await signUp('alice@example.com')
      const createRes = await h.gql(CREATE, { input: { name: 'Cybersécurité', description: 'Un domaine' } }, cookies)
      const id = createRes.body.data.createDomain.id

      const res = await h.gql(UPDATE, { id, input: { description: null } }, cookies)

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.updateDomain.description).toBeNull()
    })
  })

  // Dette du Lot 0 : `country` figurait dans CreateDomainInput mais pas dans
  // UpdateDomainInput — asymétrie non intentionnelle. Même validation ISO
  // 3166-1 alpha-2 qu'à la création (voir UPDATE_WITH_COUNTRY, qui redemande
  // `country` en sortie).
  describe('country sur updateDomain', () => {
    const UPDATE_WITH_COUNTRY = `
      mutation ($id: ID!, $input: UpdateDomainInput!) {
        updateDomain(id: $id, input: $input) { id country }
      }`

    it('modifie puis efface le pays', async () => {
      const { cookies } = await signUp('alice@example.com')
      const created = await h.gql(CREATE, { input: { name: 'Cybersécurité', country: 'fr' } }, cookies)
      const id = created.body.data.createDomain.id
      expect(created.body.data.createDomain.country).toBe('FR')

      const updated = await h.gql(UPDATE_WITH_COUNTRY, { id, input: { country: 'be' } }, cookies)
      expect(updated.body.errors).toBeUndefined()
      expect(updated.body.data.updateDomain.country).toBe('BE')

      const erased = await h.gql(UPDATE_WITH_COUNTRY, { id, input: { country: null } }, cookies)
      expect(erased.body.errors).toBeUndefined()
      expect(erased.body.data.updateDomain.country).toBeNull()
    })

    it('refuse un code qui ressemble à un code pays mais n’en est pas un', async () => {
      const { cookies } = await signUp('alice@example.com')
      const created = await h.gql(CREATE, { input: { name: 'Cybersécurité' } }, cookies)
      const id = created.body.data.createDomain.id

      const res = await h.gql(UPDATE_WITH_COUNTRY, { id, input: { country: 'ZZ' } }, cookies)
      expect(res.body.data?.updateDomain).toBeFalsy()
      expect(errorCode(res.body)).toBeDefined()

      const unchanged = await h.prisma.domain.findUnique({ where: { id } })
      expect(unchanged?.country).toBeNull()
    })
  })
})
