import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { User } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PasswordService } from './password.service'
import { TokenService } from './token.service'
import { slugify } from '../common/slug'

export interface IssuedSession {
  user: User
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(email: string, password: string, name: string, userAgent?: string): Promise<IssuedSession> {
    const normalized = email.trim().toLowerCase()
    if (await this.prisma.user.findUnique({ where: { email: normalized } })) {
      throw new ConflictException('Un compte existe déjà avec cet email')
    }
    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name,
        slug: await this.uniqueUserSlug(slugify(name)),
        passwordHash: await this.passwords.hash(password),
      },
    })
    return this.issueSession(user, randomUUID(), userAgent)
  }

  async login(email: string, password: string, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    // Message identique dans les deux cas pour empêcher l'énumération de comptes.
    const invalid = new UnauthorizedException('Email ou mot de passe incorrect')
    if (!user || !user.isActive) throw invalid
    if (!(await this.passwords.verify(user.passwordHash, password))) throw invalid
    return this.issueSession(user, randomUUID(), userAgent)
  }

  async refresh(rawRefreshToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    const invalid = new UnauthorizedException('Session expirée, reconnexion nécessaire')
    if (!rawRefreshToken) throw invalid

    const tokenHash = this.tokens.hashRefreshToken(rawRefreshToken)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } })
    if (!stored) throw invalid

    // Rejeu d'un token déjà consommé : le secret a fuité, on révoque toute la famille.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw invalid
    }

    if (stored.expiresAt < new Date() || !stored.user.isActive) throw invalid

    // Révocation conditionnelle et atomique : le `where` inclut `revokedAt: null`,
    // donc PostgreSQL fusionne le test-et-écriture en une seule opération. Si deux
    // requêtes concurrentes portent le même token, une seule obtient `count === 1` ;
    // l'autre doit traiter la situation comme un rejeu (le token a été consommé
    // entre sa lecture et son écriture) plutôt que d'émettre une session valide.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (count === 0) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw invalid
    }
    return this.issueSession(stored.user, stored.familyId, userAgent)
  }

  async logout(rawRefreshToken: string | undefined): Promise<boolean> {
    if (!rawRefreshToken) return true
    const tokenHash = this.tokens.hashRefreshToken(rawRefreshToken)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (stored) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return true
  }

  private async issueSession(user: User, familyId: string, userAgent?: string): Promise<IssuedSession> {
    const raw = this.tokens.generateRefreshToken()
    const expiresAt = this.tokens.refreshExpiryDate()
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.tokens.hashRefreshToken(raw), familyId, expiresAt, userAgent },
    })
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id, email: user.email, globalRole: user.globalRole,
    })
    return { user, accessToken, refreshToken: raw, refreshExpiresAt: expiresAt }
  }

  private async uniqueUserSlug(base: string): Promise<string> {
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? base : `${base}-${i}`
      if (!(await this.prisma.user.findUnique({ where: { slug: candidate } }))) return candidate
    }
  }
}
