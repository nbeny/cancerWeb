import type { CookieOptions, Response } from 'express'

export const ACCESS_COOKIE = 'access'
export const REFRESH_COOKIE = 'refresh'

interface CookieConfig { secure: boolean }

const base = ({ secure }: CookieConfig): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/',
})

export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  config: CookieConfig,
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base(config), maxAge: 15 * 60 * 1000 })
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base(config), expires: tokens.refreshExpiresAt })
}

export function clearSessionCookies(res: Response, config: CookieConfig): void {
  res.clearCookie(ACCESS_COOKIE, base(config))
  res.clearCookie(REFRESH_COOKIE, base(config))
}
