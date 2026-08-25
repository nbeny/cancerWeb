import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import { DomainRole, User } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { DOMAIN_ROLE_KEY } from '../decorators/require-domain-role.decorator'

// Hiérarchie : un rôle couvre tous les rôles de rang inférieur.
const RANK: Record<DomainRole, number> = {
  [DomainRole.VIEWER]: 0,
  [DomainRole.AUTHOR]: 1,
  [DomainRole.EDITOR]: 2,
  [DomainRole.OWNER]: 3,
}

@Injectable()
export class DomainRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<DomainRole | undefined>(DOMAIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const gqlCtx = GqlExecutionContext.create(context)
    const user = gqlCtx.getContext().req.user as User | undefined
    if (!user) throw new ForbiddenException('Authentification requise')
    // Pas de bypass pour GlobalRole.ADMIN : DomainsService.findForUser/remove
    // exigent une adhésion, donc un ADMIN non-membre franchissait ce guard
    // pour recevoir NOT_FOUND juste après — deux couches d'autorisation qui
    // se contredisaient, aucune testée pour ce rôle. Les deux s'alignent
    // maintenant sur « refus sauf adhésion ». Un administrateur qui doit
    // intervenir sur un domaine s'y ajoute explicitement comme membre :
    // action tracée, plutôt qu'un privilège implicite.

    const args = gqlCtx.getArgs<Record<string, unknown>>()
    const domainId = (args.domainId ?? args.id) as string | undefined
    if (!domainId) throw new ForbiddenException('Domaine non spécifié')

    const membership = await this.prisma.domainMember.findUnique({
      where: { userId_domainId: { userId: user.id, domainId } },
    })
    // Non-membre : NOT_FOUND, pour ne pas révéler l'existence de l'identifiant.
    if (!membership) throw new NotFoundException('Domaine introuvable')
    if (RANK[membership.role] < RANK[required]) {
      throw new ForbiddenException(`Rôle ${required} requis sur ce domaine`)
    }
    return true
  }
}
