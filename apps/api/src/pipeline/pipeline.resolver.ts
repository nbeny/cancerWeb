import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, StepType, User } from '@prisma/client'
import type { AIJob as PrismaAIJob, Article as PrismaArticle, PipelineStep as PrismaPipelineStep, Topic as PrismaTopic } from '@prisma/client'
import { PipelineService } from './pipeline.service'
import { Article } from '../articles/article.types'
import { Topic } from '../topics/topic.types'
import {
  AIJob,
  AIJobConnection,
  AIJobFilter,
  GenerateTopicsInput,
  PipelineRun,
  PipelineRunConnection,
  PipelineRunFilter,
  PipelineStep,
  QueuedRun,
} from './pipeline.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'
import { CurrentLoaders } from '../common/decorators/loaders.decorator'
import type { Loaders } from '../common/dataloader/loaders'
import { PageInput } from '../common/dto/page.input'

/**
 * Même motif que `TopicsResolver`/`ArticlesResolver` : `domainId` explicite
 * sur chaque opération (`DomainRoleGuard` résout le domaine via
 * `args.domainId ?? args.id`, et un run a son propre `id`), et le service
 * refiltre systématiquement par `domainId` RÉEL du run (voir
 * `PipelineService.getRun`) — un `domainId` dont l'appelant est membre mais
 * qui ne correspond pas au domaine du run ciblé échoue en NOT_FOUND, jamais
 * en faisant confiance à l'argument transmis (voir
 * `article-domain-confusion.int-spec.ts` pour le motif que `pipeline.int-spec.ts`
 * reproduit pour les runs).
 */
@Resolver(() => PipelineRun)
@UseGuards(DomainRoleGuard)
export class PipelineResolver {
  constructor(private readonly pipeline: PipelineService) {}

  @Mutation(() => PipelineRun)
  @RequireDomainRole(DomainRole.AUTHOR)
  generateArticle(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('topicId', { type: () => ID }) topicId: string,
  ): Promise<PipelineRun> {
    return this.pipeline.generateArticle(user.id, domainId, topicId)
  }

  @Mutation(() => PipelineRun)
  @RequireDomainRole(DomainRole.AUTHOR)
  generateTopics(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('input') input: GenerateTopicsInput,
  ): Promise<PipelineRun> {
    return this.pipeline.generateTopics(user.id, domainId, input.count)
  }

  @Query(() => PipelineRun)
  @RequireDomainRole(DomainRole.VIEWER)
  pipelineRun(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PipelineRun> {
    return this.pipeline.getRun(user.id, domainId, id)
  }

  @Query(() => PipelineRunConnection)
  @RequireDomainRole(DomainRole.VIEWER)
  pipelineRuns(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('filter', { type: () => PipelineRunFilter, nullable: true }) filter: PipelineRunFilter | undefined,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<{ items: PipelineRun[]; totalCount: number }> {
    return this.pipeline.listRuns(user.id, domainId, filter, page ?? { limit: 20, offset: 0 })
  }

  @Query(() => [QueuedRun])
  @RequireDomainRole(DomainRole.VIEWER)
  pipelineQueue(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
  ): Promise<Array<{ run: PipelineRun; position: number; estimatedWaitSeconds: number | null }>> {
    return this.pipeline.getQueue(user.id, domainId)
  }

  @Query(() => AIJobConnection)
  @RequireDomainRole(DomainRole.VIEWER)
  aiJobs(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('filter', { type: () => AIJobFilter, nullable: true }) filter: AIJobFilter | undefined,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<{ items: PrismaAIJob[]; totalCount: number }> {
    return this.pipeline.listAIJobs(user.id, domainId, filter, page ?? { limit: 20, offset: 0 })
  }

  @Mutation(() => PipelineRun)
  @RequireDomainRole(DomainRole.AUTHOR)
  cancelPipelineRun(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PipelineRun> {
    return this.pipeline.cancelRun(user.id, domainId, id)
  }

  @Mutation(() => PipelineRun)
  @RequireDomainRole(DomainRole.AUTHOR)
  regenerateStep(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('runId', { type: () => ID }) runId: string,
    @Args('step', { type: () => StepType }) step: StepType,
  ): Promise<PipelineRun> {
    return this.pipeline.regenerateStep(user.id, domainId, runId, step)
  }

  // -----------------------------------------------------------------
  // Champs résolus par DataLoader (Task 6) — voir la jsdoc de
  // `PipelineRun` dans `pipeline.types.ts` : jamais de propriété de classe
  // pour une relation, toujours un `@ResolveField` batché.
  // -----------------------------------------------------------------

  @ResolveField(() => [PipelineStep])
  steps(@Parent() run: PipelineRun, @CurrentLoaders() loaders: Loaders): Promise<PrismaPipelineStep[]> {
    return loaders.stepsByRunId.load(run.id)
  }

  @ResolveField(() => Article, { nullable: true })
  article(@Parent() run: PipelineRun, @CurrentLoaders() loaders: Loaders): Promise<PrismaArticle | null> {
    if (!run.articleId) return Promise.resolve(null)
    return loaders.articleById.load(run.articleId)
  }

  @ResolveField(() => Topic, { nullable: true })
  topic(@Parent() run: PipelineRun, @CurrentLoaders() loaders: Loaders): Promise<PrismaTopic | null> {
    if (!run.topicId) return Promise.resolve(null)
    return loaders.topicById.load(run.topicId)
  }
}

/** Résolveur séparé pour `PipelineStep.jobs` : un `@Resolver()` ne cible qu'un seul type GraphQL (voir `CategoryResolver` pour le même découpage). */
@Resolver(() => PipelineStep)
export class PipelineStepResolver {
  @ResolveField(() => [AIJob])
  jobs(@Parent() step: PipelineStep, @CurrentLoaders() loaders: Loaders): Promise<PrismaAIJob[]> {
    return loaders.jobsByStepId.load(step.id)
  }
}
