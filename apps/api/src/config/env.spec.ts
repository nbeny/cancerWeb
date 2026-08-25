import { parseEnv } from './env'

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  API_PORT: '4000',
  PUBLIC_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
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
})
