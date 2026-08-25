import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const REFRESH = `mutation { refresh { user { id email } } }`
const input = { email: 'bob@example.com', password: 'Sup3r-Secret!', name: 'Bob' }

const refreshCookie = (cookies: string[]): string =>
  cookies.find((c) => c.startsWith('refresh='))!.split(';')[0]!

describe('rotation du refresh token', () => {
  it('échange un refresh valide contre de nouveaux cookies', async () => {
    const reg = await h.gql(REGISTER, { input })
    const old = refreshCookie(reg.headers['set-cookie'] as unknown as string[])

    const res = await h.gql(REFRESH, {}, [old])
    expect(res.body.data.refresh.user.email).toBe(input.email)

    const fresh = refreshCookie(res.headers['set-cookie'] as unknown as string[])
    expect(fresh).not.toBe(old)
  })

  it('révoque toute la famille si un refresh déjà utilisé est rejoué', async () => {
    const reg = await h.gql(REGISTER, { input })
    const old = refreshCookie(reg.headers['set-cookie'] as unknown as string[])
    const rotated = await h.gql(REFRESH, {}, [old])
    const fresh = refreshCookie(rotated.headers['set-cookie'] as unknown as string[])

    const replay = await h.gql(REFRESH, {}, [old])
    expect(replay.body.errors).toBeDefined()

    // Le token légitime issu de la rotation est lui aussi révoqué.
    const after = await h.gql(REFRESH, {}, [fresh])
    expect(after.body.errors).toBeDefined()

    const active = await h.prisma.refreshToken.count({ where: { revokedAt: null } })
    expect(active).toBe(0)
  })

  it('refuse un refresh expiré', async () => {
    const reg = await h.gql(REGISTER, { input })
    const cookie = refreshCookie(reg.headers['set-cookie'] as unknown as string[])
    await h.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await h.gql(REFRESH, {}, [cookie])
    expect(res.body.errors).toBeDefined()
  })

  it('refuse un refresh inexistant', async () => {
    const res = await h.gql(REFRESH, {}, ['refresh=' + 'f'.repeat(64)])
    expect(res.body.errors).toBeDefined()
  })
})
