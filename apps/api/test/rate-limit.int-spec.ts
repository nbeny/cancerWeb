import { getOptionsToken } from '@nestjs/throttler'
import { createHarness, errorCode, Harness } from './app-harness'

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

  // Sans `trust proxy` côté Express, `req.ip` vaut toujours l'IP du pair
  // TCP direct (ici le processus de test), quelle que soit la valeur de
  // `X-Forwarded-For` : deux « clients » distincts finiraient sur la même
  // clé de quota. Avec `trust proxy` actif, chaque IP forwardée a son
  // propre compteur.
  it('sépare les compteurs par IP quand des clients distincts sont identifiés via X-Forwarded-For', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await h.gql(`{ serverTime }`).set('X-Forwarded-For', '203.0.113.10')
      expect(res.body.errors).toBeUndefined()
    }
    const blockedA = await h.gql(`{ serverTime }`).set('X-Forwarded-For', '203.0.113.10')
    expect(errorCode(blockedA.body)).toBe('RATE_LIMITED')

    // Un second client, avec une IP différente, ne doit pas hériter du
    // quota épuisé du premier.
    const resB = await h.gql(`{ serverTime }`).set('X-Forwarded-For', '203.0.113.20')
    expect(resB.body.errors).toBeUndefined()
  })
})
