import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, TopicStatus, User } from '@prisma/client'
import { TopicsService } from './topics.service'
import { CreateTopicInput, Topic, TopicConnection, UpdateTopicInput } from './topic.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { PageInput } from '../common/dto/page.input'

// `DomainRoleGuard` résout le domaine ciblé via `args.domainId ?? args.id` :
// contrairement à `Domain` (dont le seul identifiant guardé EST celui du
// domaine), un `Topic` a son propre `id` distinct de celui de son domaine.
// Toutes les opérations guardées ci-dessous exposent donc `domainId`
// explicitement en argument, y compris `updateTopic`/`deleteTopic`/etc., pour
// que le guard vérifie le bon rôle sur le bon domaine plutôt que de chercher
// une adhésion inexistante avec `domainId === topicId`.
@Resolver(() => Topic)
@UseGuards(DomainRoleGuard)
export class TopicsResolver {
  constructor(private readonly topicsService: TopicsService) {}

  @Query(() => TopicConnection)
  @RequireDomainRole(DomainRole.VIEWER)
  topics(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('status', { type: () => TopicStatus, nullable: true }) status: TopicStatus | undefined,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<TopicConnection> {
    return this.topicsService.listForDomain(user.id, domainId, status, page ?? { limit: 20, offset: 0 })
  }

  @Query(() => Topic)
  @RequireDomainRole(DomainRole.VIEWER)
  topic(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Topic> {
    return this.topicsService.findForUser(user.id, domainId, id)
  }

  @Mutation(() => Topic)
  @RequireDomainRole(DomainRole.AUTHOR)
  createTopic(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('input') input: CreateTopicInput,
  ): Promise<Topic> {
    return this.topicsService.create(user.id, domainId, input)
  }

  @Mutation(() => Topic)
  @RequireDomainRole(DomainRole.AUTHOR)
  updateTopic(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateTopicInput,
  ): Promise<Topic> {
    return this.topicsService.update(user.id, domainId, id, input)
  }

  @Mutation(() => Boolean)
  @RequireDomainRole(DomainRole.AUTHOR)
  deleteTopic(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.topicsService.remove(user.id, domainId, id)
  }

  @Mutation(() => Topic)
  @RequireDomainRole(DomainRole.AUTHOR)
  selectTopic(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Topic> {
    return this.topicsService.select(user.id, domainId, id)
  }

  @Mutation(() => Topic)
  @RequireDomainRole(DomainRole.AUTHOR)
  rejectTopic(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Topic> {
    return this.topicsService.reject(user.id, domainId, id)
  }
}
