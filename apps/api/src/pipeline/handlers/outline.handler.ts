import { Injectable } from '@nestjs/common'
import { StepType } from '@prisma/client'
import type { Domain, Topic } from '@prisma/client'
import { AITaskService } from '../../ai/ai-task.service'
import type { Outline } from '../../ai/ai-task.types'
import type { PipelineRunWithSteps, StepContext, StepHandler, StepOutputs } from '../step-handler'

export interface OutlineStepInput {
  domain: Domain
  topic: Topic
}

/**
 * Étape IA : demande un plan à `AITaskService.generateOutline` (qui valide
 * et relance une fois en interne, voir `ai-task.service.ts`) et rend
 * l'`Outline` structuré, à persister tel quel dans `PipelineStep.output` par
 * l'orchestrateur (Task 5).
 */
@Injectable()
export class OutlineStepHandler implements StepHandler<OutlineStepInput, Outline> {
  readonly type = StepType.OUTLINE

  constructor(private readonly aiTaskService: AITaskService) {}

  buildInput(run: PipelineRunWithSteps, _previous: StepOutputs): OutlineStepInput {
    if (!run.topic) {
      throw new Error(`Étape OUTLINE : le run ${run.id} n'a pas de sujet (topic) associé, impossible de générer un plan.`)
    }
    return { domain: run.domain, topic: run.topic }
  }

  async execute(input: OutlineStepInput, ctx: StepContext): Promise<Outline> {
    return this.aiTaskService.generateOutline(input.domain, input.topic, ctx.correlationId)
  }
}
