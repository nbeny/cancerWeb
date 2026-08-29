import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, Tag as PrismaTag, User } from '@prisma/client'
import { TagsService } from './tags.service'
import { CreateTagInput, Tag } from './tag.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'

/** Même motif et même rôle minimum que `CategoriesResolver` (voir sa jsdoc). */
@Resolver(() => Tag)
@UseGuards(DomainRoleGuard)
export class TagsResolver {
  constructor(private readonly tagsService: TagsService) {}

  @Query(() => [Tag])
  @RequireDomainRole(DomainRole.VIEWER)
  tags(@CurrentUser() user: User, @Args('domainId', { type: () => ID }) domainId: string): Promise<PrismaTag[]> {
    return this.tagsService.listForDomain(user.id, domainId)
  }

  @Mutation(() => Tag)
  @RequireDomainRole(DomainRole.EDITOR)
  createTag(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('input') input: CreateTagInput,
  ): Promise<PrismaTag> {
    return this.tagsService.create(user.id, domainId, input)
  }

  @Mutation(() => Boolean)
  @RequireDomainRole(DomainRole.EDITOR)
  deleteTag(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.tagsService.remove(user.id, domainId, id)
  }
}
