import { ExecutionContext, NotFoundException } from '@nestjs/common'
import { DomainRole, GlobalRole, User } from '@prisma/client'
import { DomainRoleGuard } from './domain-role.guard'

// Fabrique un ExecutionContext minimal : GqlExecutionContext.create() n'a
// besoin que de getArgs()/getClass()/getHandler()/getType() sur l'objet
// d'origine (voir @nestjs/graphql/dist/services/gql-execution-context.js).
function makeContext(user: User | undefined, args: Record<string, unknown>): ExecutionContext {
  const gqlArgs = [{}, args, { req: { user } }, {}]
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    getType: () => 'graphql',
    getArgs: () => gqlArgs,
  } as unknown as ExecutionContext
}

// Simule @RequireDomainRole(DomainRole.EDITOR) sur le handler ciblé.
const reflector = { getAllAndOverride: () => DomainRole.EDITOR } as never

describe('DomainRoleGuard', () => {
  // Le guard accordait un accès inconditionnel à GlobalRole.ADMIN, alors que
  // DomainsService (findForUser/remove) exige une adhésion : un ADMIN
  // non-membre franchissait ce guard puis recevait NOT_FOUND du service —
  // deux couches d'autorisation qui se contredisaient. Sans bypass, le
  // guard lui-même doit désormais consulter l'adhésion et refuser.
  it("refuse l'accès à un ADMIN global non-membre du domaine (pas de bypass)", async () => {
    const findUnique = jest.fn().mockResolvedValue(null)
    const prisma = { domainMember: { findUnique } } as never
    const guard = new DomainRoleGuard(reflector, prisma)
    const admin = { id: 'admin-1', globalRole: GlobalRole.ADMIN } as User

    await expect(guard.canActivate(makeContext(admin, { id: 'domain-1' }))).rejects.toThrow(NotFoundException)
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_domainId: { userId: 'admin-1', domainId: 'domain-1' } },
    })
  })

  it('autorise un ADMIN global qui est explicitement membre avec un rôle suffisant', async () => {
    const findUnique = jest.fn().mockResolvedValue({ role: DomainRole.EDITOR })
    const prisma = { domainMember: { findUnique } } as never
    const guard = new DomainRoleGuard(reflector, prisma)
    const admin = { id: 'admin-1', globalRole: GlobalRole.ADMIN } as User

    await expect(guard.canActivate(makeContext(admin, { id: 'domain-1' }))).resolves.toBe(true)
  })
})
