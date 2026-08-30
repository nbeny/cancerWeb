import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql'
import { RunStatus, StepStatus, StepType } from '@prisma/client'

registerEnumType(RunStatus, { name: 'RunStatus' })
registerEnumType(StepStatus, { name: 'StepStatus' })
registerEnumType(StepType, { name: 'StepType' })

/**
 * `input`/`output` (Json bruts, potentiellement volumineux — un `Outline`
 * ou un article complet) ne sont volontairement PAS exposés ici : les tests
 * et une future interface de suivi lisent l'état d'avancement (statut,
 * tentative, erreur), pas le contenu brut de chaque étape, déjà consultable
 * via l'article lui-même une fois écrit (`ArticlesService`).
 */
@ObjectType()
export class PipelineStep {
  @Field(() => ID) id!: string
  @Field(() => ID) runId!: string
  @Field(() => StepType) type!: StepType
  @Field(() => Int) order!: number
  @Field(() => StepStatus) status!: StepStatus
  @Field(() => Int) attempt!: number
  @Field(() => String, { nullable: true }) error?: string | null
  @Field(() => Date, { nullable: true }) heartbeatAt?: Date | null
  @Field(() => Date, { nullable: true }) startedAt?: Date | null
  @Field(() => Date, { nullable: true }) completedAt?: Date | null
}

@ObjectType()
export class PipelineRun {
  @Field(() => ID) id!: string
  @Field(() => ID) domainId!: string
  @Field(() => ID, { nullable: true }) topicId?: string | null
  @Field(() => ID, { nullable: true }) articleId?: string | null
  @Field(() => ID, { nullable: true }) triggeredBy?: string | null
  @Field(() => RunStatus) status!: RunStatus
  @Field(() => StepType, { nullable: true }) currentStep?: StepType | null
  @Field(() => Date, { nullable: true }) startedAt?: Date | null
  @Field(() => Date, { nullable: true }) completedAt?: Date | null
  @Field() createdAt!: Date
  @Field(() => [PipelineStep]) steps!: PipelineStep[]
}
