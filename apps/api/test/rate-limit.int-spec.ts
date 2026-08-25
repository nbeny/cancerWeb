import { getOptionsToken } from '@nestjs/throttler'
import { createHarness, Harness } from './app-harness'

const errorCode = (body: any): string =>
  body.errors?.[0]?.extensions?.code ?? body.errors?.[0]?.code

// Le ThrottlerGuard par défaut lit req/res via `context.switchToHttp()`,
// vide en GraphQL : sans la surcharge `GqlThrottlerGuard.getRequestResponse`,
// il compterait toutes les requêtes sur une même clé indéfinie (ou
// planterait sur `req.ip` undefined). On le vérifie ici avec une limite
// volontairement basse plutôt que d'attendre 200 requêtes.
describe('rate limiting GraphQL', () => {
  let h: Harness

  beforeAll(async () => {
    h = await createHarness((builder) =>
      builder.overrideProvider(getOptionsToken()).useValue([{ name: 'default', ttl: 10_000, limit: 3 }]),
    )
  })
  afterAll(async () => { await h.close() })

  it('laisse passer les requêtes sous la limite puis bloque au-delà avec un code stable', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await h.gql(`{ serverTime }`)
      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.serverTime).toEqual(expect.any(String))
    }

    const blocked = await h.gql(`{ serverTime }`)
    expect(errorCode(blocked.body)).toBe('RATE_LIMITED')
  })
})
