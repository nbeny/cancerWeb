import { Injectable } from '@nestjs/common'
import { StepType } from '@prisma/client'
import type { Domain, Topic } from '@prisma/client'
import { AITaskService } from '../../ai/ai-task.service'
import type { Outline } from '../../ai/ai-task.types'
import type { PipelineRunWithSteps, StepContext, StepHandler, StepOutputs } from '../step-handler'
import { findCompletedStepOutput } from '../step-outputs'

export interface DraftStepInput {
  domain: Domain
  topic: Topic
  outline: Outline
}

/**
 * Étape IA : rédige l'article à partir d'un plan **déjà validé et persisté**.
 *
 * `buildInput` lit l'`Outline` depuis `PipelineStep.output` (via
 * `findCompletedStepOutput`, `../step-outputs.ts`) au lieu de rappeler
 * `AITaskService.generateOutline` : c'est ce qui rend le rejeu de `DRAFT`
 * possible sans refaire `OUTLINE`, et ce qui garantit que `buildInput`
 * n'appelle jamais le provider IA — voir `draft.handler.spec.ts`, qui espionne
 * le provider pour le vérifier.
 */
@Injectable()
export class DraftStepHandler implements StepHandler<DraftStepInput, string> {
  readonly type = StepType.DRAFT

  constructor(private readonly aiTaskService: AITaskService) {}

  buildInput(run: PipelineRunWithSteps, _previous: StepOutputs): DraftStepInput {
    if (!run.topic) {
      throw new Error(`Étape DRAFT : le run ${run.id} n'a pas de sujet (topic) associé, impossible de rédiger l'article.`)
    }
    const outline = findCompletedStepOutput<Outline>(run.steps, StepType.OUTLINE, run.id)
    return { domain: run.domain, topic: run.topic, outline }
  }

  async execute(input: DraftStepInput, ctx: StepContext): Promise<string> {
    return this.aiTaskService.generateDraft(input.domain, input.topic, input.outline, ctx.correlationId)
  }
}
