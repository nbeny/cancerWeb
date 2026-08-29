import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { Category as PrismaCategory, DomainRole, User } from '@prisma/client'
import { CategoriesService } from './categories.service'
import { Category, CreateCategoryInput, UpdateCategoryInput } from './category.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'

// Même motif que TopicsResolver/ArticlesResolver : `Category` a son propre
// `id`, distinct du `domainId` de son domaine — `domainId` explicite sur
// chaque opération pour que `DomainRoleGuard` (qui résout via
// `args.domainId ?? args.id`) vérifie le bon rôle sur le bon domaine.
//
// Rôle minimum retenu : VIEWER en lecture (comme partout ailleurs), EDITOR en
// écriture (création/modification/suppression) — la taxonomie (catégories et
// tags) est une ressource partagée par tout le domaine, pas la propriété d'un
// auteur particulier comme un article ou un topic ; EDITOR est le rôle qui a
// déjà autorité sur le contenu éditorial commun (voir `updateDomain`,
// `approveArticle`/`publishArticle`, également en EDITOR).
@Resolver(() => Category)
@UseGuards(DomainRoleGuard)
export class CategoriesResolver {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Query(() => [Category])
  @RequireDomainRole(DomainRole.VIEWER)
  categories(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
  ): Promise<PrismaCategory[]> {
    return this.categoriesService.listForDomain(user.id, domainId)
  }

  @Query(() => Category)
  @RequireDomainRole(DomainRole.VIEWER)
  category(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PrismaCategory> {
    return this.categoriesService.findForUser(user.id, domainId, id)
  }

  @Mutation(() => Category)
  @RequireDomainRole(DomainRole.EDITOR)
  createCategory(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('input') input: CreateCategoryInput,
  ): Promise<PrismaCategory> {
    return this.categoriesService.create(user.id, domainId, input)
  }

  @Mutation(() => Category)
  @RequireDomainRole(DomainRole.EDITOR)
  updateCategory(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCategoryInput,
  ): Promise<PrismaCategory> {
    return this.categoriesService.update(user.id, domainId, id, input)
  }

  @Mutation(() => Boolean)
  @RequireDomainRole(DomainRole.EDITOR)
  deleteCategory(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.categoriesService.remove(user.id, domainId, id)
  }
}
