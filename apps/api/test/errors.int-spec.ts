import request from 'supertest'
import { Writable } from 'node:stream'
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino'
import { createHarness, Harness } from './app-harness'
import { CORRELATION_HEADER } from '../src/common/middleware/correlation-id.middleware'
import { createPinoHttpOptions } from '../src/common/logging/pino-http-options'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const errorCode = (body: any): string =>
  body.errors?.[0]?.extensions?.code ?? body.errors?.[0]?.code

describe('gestion des erreurs', () => {
  it('mappe une exception métier vers un code stable', async () => {
    const res = await h.gql(`{ me { id } }`)
    expect(errorCode(res.body)).toBe('UNAUTHENTICATED')
  })

  it('ne fuit jamais de détail interne Prisma au client', async () => {
    const reg = await h.gql(
      `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`,
      { input: { email: 'a@example.com', password: 'Sup3r-Secret!', name: 'Alpha' } },
    )
    const cookies = reg.headers['set-cookie'] as unknown as string[]
    const res = await h.gql(
      `mutation ($id: ID!) { deleteDomain(id: $id) }`,
      { id: 'identifiant-inexistant' },
      cookies,
    )
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toMatch(/prisma|PrismaClient|P20\d\d/i)
  })

  it('renvoie une erreur sur un input invalide sans créer de compte', async () => {
    const res = await h.gql(
      `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`,
      { input: { email: 'pas-un-email', password: 'Sup3r-Secret!', name: 'Alpha' } },
    )
    expect(res.body.errors).toBeDefined()
    expect(await h.prisma.user.count()).toBe(0)
  })

  it('renvoie le détail de validation par champ plutôt que "Bad Request Exception"', async () => {
    const res = await h.gql(
      `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`,
      { input: { email: 'alpha@example.com', password: 'trop-court', name: 'Alpha' } },
    )
    const message = res.body.errors?.[0]?.message
    expect(message).toContain('12 caractères')
    expect(message).not.toBe('Bad Request Exception')
  })
})

describe('correlation ID', () => {
  it("pose l'en-tête x-correlation-id sur la réponse quand le client n'en fournit pas", async () => {
    const res = await h.gql(`{ serverTime }`)
    const id = res.headers[CORRELATION_HEADER] as string | undefined
    expect(id).toEqual(expect.any(String))
    expect(id?.length).toBeGreaterThan(0)
  })

  it("reprend la valeur fournie par le client si elle existe", async () => {
    const clientId = 'test-correlation-id-abc123'
    const res = await request(h.app.getHttpServer())
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .set(CORRELATION_HEADER, clientId)
      .send({ query: '{ serverTime }' })
    expect(res.headers[CORRELATION_HEADER]).toBe(clientId)
  })
})

describe('en-têtes de sécurité (helmet)', () => {
  it('pose les en-têtes de durcissement HTTP sans CSP (API sans HTML)', async () => {
    const res = await h.gql(`{ serverTime }`)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-dns-prefetch-control']).toBe('off')
    expect(res.headers['content-security-policy']).toBeUndefined()
  })
})

// Le logger structuré (pino-http) écrit une ligne JSON par requête. Par
// défaut, pino écrit directement sur le descripteur de fichier stdout (via
// sonic-boom), pas via `process.stdout.write` — un monkey-patch de
// `process.stdout.write` ne voit donc jamais ces écritures. Pour capturer
// réellement la sortie du logger sans supposer que la config `redact`
// fonctionne, ce bloc démarre sa propre instance de l'application avec la
// même configuration pino-http que la production (`createPinoHttpOptions`),
// mais dirigée vers un flux mémoire qu'on peut inspecter directement.
class MemoryStream extends Writable {
  chunks: string[] = []
  override _write(chunk: unknown, _encoding: string, callback: (error?: Error | null) => void): void {
    this.chunks.push(String(chunk))
    callback()
  }
}

describe('logs structurés — non-fuite de secrets', () => {
  let logHarness: Harness
  let memoryStream: MemoryStream

  beforeAll(async () => {
    memoryStream = new MemoryStream()
    logHarness = await createHarness((builder) =>
      builder.overrideProvider(PARAMS_PROVIDER_TOKEN).useValue({
        pinoHttp: [createPinoHttpOptions(), memoryStream],
      }),
    )
  })
  afterAll(async () => { await logHarness.close() })
  beforeEach(async () => { await logHarness.reset() })

  const cookieValue = (cookies: string[], name: string): string => {
    const cookie = cookies.find((c) => c.startsWith(`${name}=`))
    if (!cookie) throw new Error(`cookie ${name} introuvable`)
    const value = cookie.split(';')[0]?.split('=')[1]
    if (!value) throw new Error(`valeur de cookie ${name} introuvable`)
    return value
  }

  it("ne journalise jamais le mot de passe en clair ni la valeur des cookies de session lors d'un login", async () => {
    const email = 'logtest@example.com'
    const password = 'Sup3r-Secret!Log'
    await logHarness.gql(
      `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`,
      { input: { email, password, name: 'Log Test' } },
    )
    memoryStream.chunks.length = 0

    const res = await logHarness.gql(
      `mutation ($input: LoginInput!) { login(input: $input) { user { id } } }`,
      { input: { email, password } },
    )

    const output = memoryStream.chunks.join('')
    expect(res.body.data.login.user.id).toEqual(expect.any(String))
    // Preuve que le test observe bien une ligne de log réelle pour cette
    // requête (sinon les assertions de non-fuite ci-dessous seraient
    // vides de sens) : la ligne contient le statut 200 de la réponse.
    expect(output).toMatch(/"statusCode":200/)

    const cookies = res.headers['set-cookie'] as unknown as string[]
    const accessToken = cookieValue(cookies, 'access')
    const refreshToken = cookieValue(cookies, 'refresh')

    expect(output).not.toContain(password)
    expect(output).not.toContain(accessToken)
    expect(output).not.toContain(refreshToken)
    expect(output).toContain('[Redacted]')
  })
})
