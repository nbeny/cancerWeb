import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { TokenService } from '../../auth/token.service'
import { ACCESS_COOKIE } from '../../auth/cookies'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = GqlExecutionContext.create(context).getContext().req
    const token = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? bearer(req)
    if (!token) throw new UnauthorizedException('Authentification requise')

    let payload
    try {
      payload = await this.tokens.verifyAccessToken(token)
    } catch {
      throw new UnauthorizedException('Session invalide ou expirée')
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) throw new UnauthorizedException('Compte introuvable ou désactivé')

    req.user = user
    return true
  }
}

function bearer(req: { headers?: Record<string, unknown> }): string | undefined {
  const header = req.headers?.authorization
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined
}
