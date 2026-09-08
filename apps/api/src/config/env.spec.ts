import { parseEnv } from './env'

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  API_PORT: '4000',
  PUBLIC_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  AI_PROVIDER: 'fake',
}

describe('parseEnv', () => {
  it('accepte un environnement valide et convertit les types', () => {
    const env = parseEnv(valid)
    expect(env.API_PORT).toBe(4000)
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7)
    expect(env.COOKIE_SECURE).toBe(false)
  })

  it('rejette un secret JWT trop court', () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: 'court' })).toThrow(/JWT_ACCESS_SECRET/)
  })

  it('rejette une DATABASE_URL absente', () => {
    const { DATABASE_URL, ...withoutDb } = valid
    expect(() => parseEnv(withoutDb)).toThrow(/DATABASE_URL/)
  })

  it('rejette un secret placeholder "change-me-" en production', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/)
  })

  it('accepte un secret placeholder "change-me-" hors production (dev, test, CI)', () => {
    expect(() =>
      parseEnv({ ...valid, NODE_ENV: 'test', JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters' }),
    ).not.toThrow()
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'development',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret-at-least-32-chars',
      }),
    ).not.toThrow()
  })

  it('accepte un vrai secret en production', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
      }),
    ).not.toThrow()
  })

  it('accepte une configuration sans WEB_INTERNAL_URL ni REVALIDATE_SECRET', () => {
    // Volontairement optionnelles : une API qui refuserait de démarrer faute
    // de savoir prévenir le front rendrait le back-office indisponible pour
    // un service purement cosmétique (voir la jsdoc dans env.ts).
    const env = parseEnv(valid)
    expect(env.WEB_INTERNAL_URL).toBeUndefined()
    expect(env.REVALIDATE_SECRET).toBeUndefined()
  })

  it('rejette un REVALIDATE_SECRET placeholder "change-me-" en production', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        REVALIDATE_SECRET: 'change-me-revalidate-secret',
      }),
    ).toThrow(/REVALIDATE_SECRET/)
  })

  it('rejette une WEB_INTERNAL_URL qui n’est pas une URL', () => {
    // Note : `web:3001` PASSE cette validation — c'est une URL WHATWG valide
    // (schéma `web:`, chemin opaque `3001`), comme le sont `postgresql://...`
    // et `redis://...` validés de la même façon juste au-dessus. Le contrôle
    // porte sur la forme, pas sur le protocole.
    expect(() => parseEnv({ ...valid, WEB_INTERNAL_URL: 'http://web :3001' })).toThrow(/WEB_INTERNAL_URL/)
  })

  it.each(['fake', 'cli', 'http'])("accepte AI_PROVIDER=%s", (provider) => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: provider })).not.toThrow()
  })

  it('rejette une AI_PROVIDER absente', () => {
    const { AI_PROVIDER, ...withoutAiProvider } = valid
    expect(() => parseEnv(withoutAiProvider)).toThrow(/AI_PROVIDER/)
  })

  it('rejette une AI_PROVIDER inconnue en listant les valeurs acceptées', () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER/)
  })
})
