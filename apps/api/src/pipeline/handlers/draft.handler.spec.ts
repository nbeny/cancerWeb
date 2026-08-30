import { StepStatus, StepType } from '@prisma/client'
import { AITaskService } from '../../ai/ai-task.service'
import { FakeAIProvider } from '../../ai/providers/fake.provider'
import type { Outline } from '../../ai/ai-task.types'
import { makePipelineRun, makePipelineStep } from '../test-fixtures'
import { DraftStepHandler } from './draft.handler'

const PERSISTED_OUTLINE: Outline = {
  h1: 'Un plan déjà validé et persisté',
  sections: [
    { title: 'Section persistée A', depth: 2 },
    { title: 'Section persistée B', depth: 2 },
  ],
}

describe('DraftStepHandler', () => {
  it('expose le type DRAFT', () => {
    const handler = new DraftStepHandler(new AITaskService(new FakeAIProvider()))
    expect(handler.type).toBe('DRAFT')
  })

  describe('buildInput', () => {
    it("lit l'OUTLINE déjà persisté dans PipelineStep.output, sans jamais appeler le provider IA", () => {
      const provider = new FakeAIProvider()
      const completeSpy = jest.spyOn(provider, 'complete')
      const handler = new DraftStepHandler(new AITaskService(provider))

      const outlineStep = makePipelineStep({
        type: StepType.OUTLINE,
        status: StepStatus.COMPLETED,
        output: PERSISTED_OUTLINE,
      })
      const run = makePipelineRun({ steps: [outlineStep] })

      const input = handler.buildInput(run, {})

      // La preuve centrale de ce handler : l'outline utilisé est EXACTEMENT
      // celui persisté sur l'étape OUTLINE, pas un outline reconstruit.
      expect(input.outline).toEqual(PERSISTED_OUTLINE)
      expect(input.domain).toBe(run.domain)
      expect(input.topic).toBe(run.topic)
      // buildInput est synchrone et ne doit toucher ni le provider ni l'IA.
      expect(completeSpy).not.toHaveBeenCalled()
    })

    it('choisit la tentative OUTLINE la plus récente quand plusieurs existent (rejeu)', () => {
      const handler = new DraftStepHandler(new AITaskService(new FakeAIProvider()))
      const oldOutline: Outline = { h1: 'Ancien plan', sections: [] }
      const run = makePipelineRun({
        steps: [
          makePipelineStep({ id: 's1', type: StepType.OUTLINE, status: StepStatus.COMPLETED, attempt: 0, output: oldOutline }),
          makePipelineStep({ id: 's2', type: StepType.OUTLINE, status: StepStatus.COMPLETED, attempt: 1, output: PERSISTED_OUTLINE }),
        ],
      })

      const input = handler.buildInput(run, {})

      expect(input.outline).toEqual(PERSISTED_OUTLINE)
    })

    it("échoue explicitement si aucun OUTLINE complété n'est persisté (impossible de rejouer DRAFT sans plan)", () => {
      const handler = new DraftStepHandler(new AITaskService(new FakeAIProvider()))
      const run = makePipelineRun({ steps: [] })

      expect(() => handler.buildInput(run, {})).toThrow(/OUTLINE/)
    })

    it("échoue explicitement si le run n'a pas de sujet associé", () => {
      const handler = new DraftStepHandler(new AITaskService(new FakeAIProvider()))
      const outlineStep = makePipelineStep({ type: StepType.OUTLINE, status: StepStatus.COMPLETED, output: PERSISTED_OUTLINE })
      const run = makePipelineRun({ steps: [outlineStep], topic: null })

      expect(() => handler.buildInput(run, {})).toThrow(/sujet|topic/i)
    })
  })

  describe('execute', () => {
    it('délègue à AITaskService.generateDraft et renvoie le Markdown produit', async () => {
      const handler = new DraftStepHandler(new AITaskService(new FakeAIProvider()))
      const outlineStep = makePipelineStep({ type: StepType.OUTLINE, status: StepStatus.COMPLETED, output: PERSISTED_OUTLINE })
      const run = makePipelineRun({ steps: [outlineStep] })
      const input = handler.buildInput(run, {})

      const draft = await handler.execute(input, {})

      expect(draft).toMatch(/^# /)
    })

    it('propage le correlationId du contexte au provider', async () => {
      const provider = new FakeAIProvider()
      const completeSpy = jest.spyOn(provider, 'complete')
      const handler = new DraftStepHandler(new AITaskService(provider))
      const outlineStep = makePipelineStep({ type: StepType.OUTLINE, status: StepStatus.COMPLETED, output: PERSISTED_OUTLINE })
      const run = makePipelineRun({ steps: [outlineStep] })
      const input = handler.buildInput(run, {})

      await handler.execute(input, { correlationId: 'corr-draft' })

      expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'corr-draft' }))
    })
  })
})
