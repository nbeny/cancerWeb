import { DomainRole, GlobalRole } from '@prisma/client'
import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const UPDATE = `mutation ($id: ID!, $input: UpdateDomainInput!) { updateDomain(id: $id, input: $input) { id name } }`
const DELETE = `mutation ($id: ID!) { deleteDomain(id: $id) }`

async function signUp(email: string) {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

const errorCode = (body: any): string =>
  body.errors?.[0]?.extensions?.code ?? body.errors?.[0]?.code

describe('autorisation par domaine', () => {
  it('interdit à un non-membre de modifier un domaine', async () => {
    const alice = await signUp('alice@example.com')
    const bob = await signUp('bob@example.com')
    const created = await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    const domainId = created.body.data.createDomain.id

    const res = await h.gql(UPDATE, { id: domainId, input: { name: 'Piraté' } }, bob.cookies)
    expect(['FORBIDDEN', 'NOT_FOUND']).toContain(errorCode(res.body))

    const unchanged = await h.prisma.domain.findUnique({ where: { id: domainId } })
    expect(unchanged?.name).toBe('Domaine Alice')
  })

  it('interdit à un AUTHOR de modifier un domaine (rôle insuffisant)', async () => {
    const alice = await signUp('alice@example.com')
    const carol = await signUp('carol@example.com')
    const created = await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    const domainId = created.body.data.createDomain.id

    await h.prisma.domainMember.create({
      data: { domainId, userId: carol.userId, role: DomainRole.AUTHOR },
    })

    const res = await h.gql(UPDATE, { id: domainId, input: { name: 'Modifié' } }, carol.cookies)
    expect(errorCode(res.body)).toBe('FORBIDDEN')
  })

  it('autorise un EDITOR à modifier un domaine', async () => {
    const alice = await signUp('alice@example.com')
    const dan = await signUp('dan@example.com')
    const created = await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    const domainId = created.body.data.createDomain.id

    await h.prisma.domainMember.create({
      data: { domainId, userId: dan.userId, role: DomainRole.EDITOR },
    })

    const res = await h.gql(UPDATE, { id: domainId, input: { name: 'Édité par Dan' } }, dan.cookies)
    expect(res.body.data.updateDomain.name).toBe('Édité par Dan')
  })

  it('interdit à un EDITOR de supprimer un domaine', async () => {
    const alice = await signUp('alice@example.com')
    const dan = await signUp('dan@example.com')
    const created = await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    const domainId = created.body.data.createDomain.id

    await h.prisma.domainMember.create({
      data: { domainId, userId: dan.userId, role: DomainRole.EDITOR },
    })

    const res = await h.gql(DELETE, { id: domainId }, dan.cookies)
    expect(errorCode(res.body)).toBe('FORBIDDEN')
    expect(await h.prisma.domain.count()).toBe(1)
  })

  it('autorise un OWNER à supprimer son domaine', async () => {
    const alice = await signUp('alice@example.com')
    const created = await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    const res = await h.gql(DELETE, { id: created.body.data.createDomain.id }, alice.cookies)
    expect(res.body.data.deleteDomain).toBe(true)
    expect(await h.prisma.domain.count()).toBe(0)
  })

  // Un ADMIN global n'a pas de bypass implicite sur les domaines : les deux
  // couches d'autorisation (ce guard et DomainsService) doivent s'accorder
  // sur « refus sauf adhésion ». Un ADMIN qui a besoin d'intervenir sur un
  // domaine doit s'y ajouter explicitement comme membre.
  it('interdit à un ADMIN global non-membre d’accéder à un domaine tiers', async () => {
    const alice = await signUp('alice@example.com')
    const admin = await signUp('admin@example.com')
    await h.prisma.user.update({ where: { id: admin.userId }, data: { globalRole: GlobalRole.ADMIN } })

    const created = await h.gql(CREATE, { input: { name: 'Domaine Alice' } }, alice.cookies)
    const domainId = created.body.data.createDomain.id

    const updateRes = await h.gql(UPDATE, { id: domainId, input: { name: 'Piraté par ADMIN' } }, admin.cookies)
    expect(errorCode(updateRes.body)).toBe('NOT_FOUND')

    const deleteRes = await h.gql(DELETE, { id: domainId }, admin.cookies)
    expect(errorCode(deleteRes.body)).toBe('NOT_FOUND')

    const unchanged = await h.prisma.domain.findUnique({ where: { id: domainId } })
    expect(unchanged?.name).toBe('Domaine Alice')
  })
})
