import { Field, ID, Int, InputType, ObjectType, registerEnumType } from '@nestjs/graphql'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { JobStatus, RunStatus, StepStatus, StepType } from '@prisma/client'
import { GENERATE_TOPICS_COUNT_MAX, GENERATE_TOPICS_COUNT_MIN } from '@cancerweb/validation'
import { Paginated } from '../common/dto/page.input'

registerEnumType(RunStatus, { name: 'RunStatus' })
registerEnumType(StepStatus, { name: 'StepStatus' })
registerEnumType(StepType, { name: 'StepType' })
registerEnumType(JobStatus, { name: 'JobStatus' })

/**
 * `input`/`output` (Json bruts, potentiellement volumineux — un `Outline`
 * ou un article complet) ne sont volontairement PAS exposés ici : les tests
 * et une future interface de suivi lisent l'état d'avancement (statut,
 * tentative, erreur), pas le contenu brut de chaque étape, déjà consultable
 * via l'article lui-même une fois écrit (`ArticlesService`).
 *
 * `jobs` (Task 6) n'est PAS déclaré comme propriété de classe : c'est un
 * `@ResolveField` pur dans `PipelineStepResolver`, chargé via
 * `loaders.jobsByStepId` — même motif que `Category.children`
 * (`category.resolver.ts`).
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

/**
 * `steps`, `article` et `topic` ne sont PAS des propriétés de classe : ce
 * sont des `@ResolveField` purs dans `PipelineResolver`, chargés via
 * DataLoader (`stepsByRunId`, `articleById`, `topicById`) plutôt que par un
 * `include` Prisma systématique — même motif que `Category.children`/
 * `Article.author` ailleurs dans l'API. `topicId`/`articleId` restent des
 * champs scalaires directs (déjà présents sur la ligne `PipelineRun`, aucun
 * chargement supplémentaire), pour les appelants qui n'ont besoin que de
 * l'identifiant.
 */
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
}

@ObjectType()
export class PipelineRunConnection extends Paginated(PipelineRun) {}

/**
 * Trace d'un appel IA (Task 6) : `input`/`output`/`rawOutput` restent hors
 * de l'API GraphQL, mêmes raisons que sur `PipelineStep` — potentiellement
 * volumineux, de diagnostic plutôt que de présentation. `type` est une
 * chaîne libre côté Prisma (pas `StepType`) : voir la jsdoc de
 * `PipelineService.runAiStep`, qui y écrit la valeur `StepType` telle
 * quelle — c'est ce qui permet à l'estimation d'attente (`medianDurationMs`)
 * de regrouper par type d'étape sans jointure.
 */
@ObjectType()
export class AIJob {
  @Field(() => ID) id!: string
  @Field(() => ID, { nullable: true }) stepId?: string | null
  @Field() type!: string
  @Field() provider!: string
  @Field() model!: string
  @Field() promptVersion!: string
  @Field(() => JobStatus) status!: JobStatus
  @Field(() => String, { nullable: true }) error?: string | null
  @Field(() => Int, { nullable: true }) durationMs?: number | null
  @Field(() => String, { nullable: true }) correlationId?: string | null
  @Field(() => Date, { nullable: true }) startedAt?: Date | null
  @Field(() => Date, { nullable: true }) completedAt?: Date | null
  @Field() createdAt!: Date
}

@ObjectType()
export class AIJobConnection extends Paginated(AIJob) {}

/**
 * Position d'un run dans la file d'attente réelle (Task 6) : `position` est
 * 1-indexée (1 = prochain/actuellement en cours de traitement — voir
 * `PipelineService.getQueue`, qui ordonne RUNNING avant PENDING, chacun par
 * ordre d'ancienneté). `estimatedWaitSeconds` est `null` plutôt qu'un chiffre
 * inventé quand l'historique d'`AIJob` est insuffisant pour au moins une des
 * étapes restantes du run — voir `PipelineService.medianDurationMs` pour le
 * seuil retenu et sa justification. Un `null` doit être lu par l'interface
 * comme « estimation indisponible », jamais comme "0 seconde".
 */
@ObjectType()
export class QueuedRun {
  @Field(() => PipelineRun) run!: PipelineRun
  @Field(() => Int) position!: number
  @Field(() => Int, { nullable: true }) estimatedWaitSeconds?: number | null
}

@InputType()
export class GenerateTopicsInput {
  @Field(() => Int)
  @IsInt()
  @Min(GENERATE_TOPICS_COUNT_MIN)
  @Max(GENERATE_TOPICS_COUNT_MAX)
  count!: number
}

@InputType()
export class PipelineRunFilter {
  @Field(() => RunStatus, { nullable: true }) @IsOptional() @IsEnum(RunStatus) status?: RunStatus
}

@InputType()
export class AIJobFilter {
  @Field(() => JobStatus, { nullable: true }) @IsOptional() @IsEnum(JobStatus) status?: JobStatus
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() type?: string
}
