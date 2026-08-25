import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, User } from '@prisma/client'
import { DomainsService } from './domains.service'
import { CreateDomainInput, Domain, DomainConnection, UpdateDomainInput } from './domain.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { PageInput } from '../common/dto/page.input'

@Resolver(() => Domain)
@UseGuards(DomainRoleGuard)
export class DomainsResolver {
  // Nommé `domainsService` (et non `domains`) pour ne pas entrer en conflit
  // avec la méthode de résolveur `domains` ci-dessous : un membre de classe
  // ne peut porter deux fois le même identifiant.
  constructor(private readonly domainsService: DomainsService) {}

  @Query(() => DomainConnection)
  domains(
    @CurrentUser() user: User,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<DomainConnection> {
    return this.domainsService.listForUser(user.id, page ?? { limit: 20, offset: 0 })
  }

  @Query(() => Domain)
  @RequireDomainRole(DomainRole.VIEWER)
  domain(@CurrentUser() user: User, @Args('id', { type: () => ID }) id: string): Promise<Domain> {
    return this.domainsService.findForUser(user.id, id)
  }

  @Mutation(() => Domain)
  createDomain(@CurrentUser() user: User, @Args('input') input: CreateDomainInput): Promise<Domain> {
    return this.domainsService.create(user.id, input)
  }

  @Mutation(() => Domain)
  @RequireDomainRole(DomainRole.EDITOR)
  updateDomain(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateDomainInput,
  ): Promise<Domain> {
    return this.domainsService.update(user.id, id, input)
  }

  @Mutation(() => Boolean)
  @RequireDomainRole(DomainRole.OWNER)
  deleteDomain(@CurrentUser() user: User, @Args('id', { type: () => ID }) id: string): Promise<boolean> {
    return this.domainsService.remove(user.id, id)
  }
}
