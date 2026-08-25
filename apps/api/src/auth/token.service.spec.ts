import { JwtService } from '@nestjs/jwt'
import { TokenService } from './token.service'

const env = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 7,
}
const config = { get: (k: keyof typeof env) => env[k] } as never

describe('TokenService', () => {
  const service = new TokenService(new JwtService({}), config)

  it('signe et vérifie un access token', async () => {
    const token = await service.signAccessToken({ sub: 'user-1', email: 'a@b.c', globalRole: 'USER' })
    const payload = await service.verifyAccessToken(token)
    expect(payload.sub).toBe('user-1')
  })

  it('rejette un access token signé avec le mauvais secret', async () => {
    const other = new TokenService(
      new JwtService({}),
      { get: (k: string) => (k === 'JWT_ACCESS_SECRET' ? 'z'.repeat(32) : env[k as keyof typeof env]) } as never,
    )
    const token = await other.signAccessToken({ sub: 'x', email: 'a@b.c', globalRole: 'USER' })
    await expect(service.verifyAccessToken(token)).rejects.toThrow()
  })

  it('hache un refresh token de façon déterministe et irréversible', () => {
    const raw = service.generateRefreshToken()
    expect(raw).toHaveLength(64)
    const h1 = service.hashRefreshToken(raw)
    const h2 = service.hashRefreshToken(raw)
    expect(h1).toBe(h2)
    expect(h1).not.toBe(raw)
    expect(h1).toHaveLength(64)
  })

  it('génère des refresh tokens uniques', () => {
    expect(service.generateRefreshToken()).not.toBe(service.generateRefreshToken())
  })

  it('calcule une date d’expiration cohérente avec la TTL', () => {
    const expiry = service.refreshExpiryDate()
    const days = (expiry.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
  })
})
