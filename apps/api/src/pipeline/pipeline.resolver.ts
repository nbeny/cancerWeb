import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { DomainRole, StepType, User } from '@prisma/client'
import { PipelineService } from './pipeline.service'
import { PipelineRun } from './pipeline.types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { RequireDomainRole } from '../common/decorators/require-domain-role.decorator'
import { DomainRoleGuard } from '../common/guards/domain-role.guard'

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

  @Query(() => PipelineRun)
  @RequireDomainRole(DomainRole.VIEWER)
  pipelineRun(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PipelineRun> {
    return this.pipeline.getRun(user.id, domainId, id)
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
  regeneratePipelineStep(
    @CurrentUser() user: User,
    @Args('domainId', { type: () => ID }) domainId: string,
    @Args('runId', { type: () => ID }) runId: string,
    @Args('stepType', { type: () => StepType }) stepType: StepType,
  ): Promise<PipelineRun> {
    return this.pipeline.regenerateStep(user.id, domainId, runId, stepType)
  }
}
