import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes } from 'node:crypto'
import { Env } from '../config/env'

export interface AccessTokenPayload {
  sub: string
  email: string
  globalRole: string
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL'),
    })
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
    })
  }

  /** Le refresh token est un secret opaque, pas un JWT : il n'a rien à transporter. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('hex')
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  refreshExpiryDate(): Date {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS')
    return new Date(Date.now() + days * 86_400_000)
  }
}
