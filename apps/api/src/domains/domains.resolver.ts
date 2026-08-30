import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql'
import { ForbiddenException, UseGuards } from '@nestjs/common'
import { DomainRole, User } from '@prisma/client'
import { DomainsService } from './domains.service'
import { CreateDomainInput, Domain, DomainConnection, UpdateDomainInput } from './domain.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { CurrentLoaders } from '../common/decorators/loaders.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { PageInput } from '../common/dto/page.input'
import type { Loaders } from '../common/dataloader/loaders'

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

  // Pas déclaré comme propriété de classe dans `domain.types.ts` : même motif
  // que `Category.parent`/`children`/`articleCount` (voir leur jsdoc) — un
  // `@ResolveField` pur suffit à NestJS GraphQL (code-first) pour l'ajouter
  // au SDL, sans faire porter le champ par le service applicatif.
  //
  // Chargé via `loaders.myRoleByDomain` (voir `common/dataloader/loaders.ts`) :
  // sans DataLoader, lister N domaines avec `myRole` émettrait N requêtes —
  // exactement le N+1 que `n-plus-one.int-spec.ts` vérifie déjà pour
  // `Article.author`/`domain`/`category`/`tags`.
  //
  // Aucun `@RequireDomainRole` ici (même raison que les `@ResolveField` sans
  // guard d'`ArticlesResolver`) : un `Domain` n'atteint jamais ce champ sans
  // que l'appelant y soit déjà autorisé — `domains`/`domain` ne renvoient que
  // des domaines dont l'utilisateur COURANT est membre, et `Article.domain`
  // n'est atteignable qu'après un article déjà scopé au même domaine. Un rôle
  // manquant ici (`null`) signalerait donc une incohérence, pas un cas
  // normal — d'où le `ForbiddenException` plutôt qu'un champ nullable.
  @ResolveField(() => DomainRole)
  async myRole(
    @Parent() domain: Domain,
    @CurrentUser() user: User,
    @CurrentLoaders() loaders: Loaders,
  ): Promise<DomainRole> {
    const role = await loaders.myRoleByDomain.load(`${user.id}:${domain.id}`)
    if (!role) throw new ForbiddenException('Vous n’êtes pas membre de ce domaine')
    return role
  }
}
