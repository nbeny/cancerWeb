import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `
  mutation ($input: RegisterInput!) {
    register(input: $input) { user { id email name slug globalRole } }
  }`

const LOGIN = `
  mutation ($input: LoginInput!) {
    login(input: $input) { user { id email } }
  }`

const ME = `{ me { id email } }`

const input = { email: 'alice@example.com', password: 'Sup3r-Secret!', name: 'Alice Martin' }

const errorCode = (body: any): string =>
  body.errors?.[0]?.extensions?.code ?? body.errors?.[0]?.code

describe('authentification', () => {
  it('inscrit un utilisateur et pose les cookies', async () => {
    const res = await h.gql(REGISTER, { input })
    expect(res.body.data.register.user.email).toBe('alice@example.com')
    expect(res.body.data.register.user.slug).toBe('alice-martin')

    const cookies = res.headers['set-cookie'] as unknown as string[]
    expect(cookies.some((c) => c.startsWith('access='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('refresh='))).toBe(true)
    expect(cookies.every((c) => c.includes('HttpOnly'))).toBe(true)
  })

  it('ne renvoie jamais le hash du mot de passe', async () => {
    const res = await h.gql(REGISTER, { input })
    expect(JSON.stringify(res.body)).not.toContain('argon2')
  })

  it('refuse une seconde inscription avec le même email', async () => {
    await h.gql(REGISTER, { input })
    const res = await h.gql(REGISTER, { input })
    expect(errorCode(res.body)).toBe('CONFLICT')
  })

  it('refuse un mot de passe trop court', async () => {
    const res = await h.gql(REGISTER, { input: { ...input, password: 'court' } })
    expect(res.body.errors).toBeDefined()
    expect(await h.prisma.user.count()).toBe(0)
  })

  it('connecte un utilisateur existant', async () => {
    await h.gql(REGISTER, { input })
    const res = await h.gql(LOGIN, { input: { email: input.email, password: input.password } })
    expect(res.body.data.login.user.email).toBe(input.email)
  })

  it('renvoie la même erreur pour un email inconnu et un mot de passe faux', async () => {
    await h.gql(REGISTER, { input })
    const wrongPass = await h.gql(LOGIN, { input: { email: input.email, password: 'FauxMotDePasse!' } })
    const wrongMail = await h.gql(LOGIN, { input: { email: 'inconnu@example.com', password: input.password } })
    expect(wrongPass.body.errors[0].message).toBe(wrongMail.body.errors[0].message)
  })

  it('refuse me sans cookie', async () => {
    const res = await h.gql(ME)
    expect(errorCode(res.body)).toBe('UNAUTHENTICATED')
  })

  it('autorise me avec le cookie de session', async () => {
    const reg = await h.gql(REGISTER, { input })
    const cookies = reg.headers['set-cookie'] as unknown as string[]
    const res = await h.gql(ME, {}, cookies)
    expect(res.body.data.me.email).toBe(input.email)
  })
})
