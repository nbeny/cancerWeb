import { StepStatus, StepType } from '@prisma/client'
import type { PipelineStep } from '@prisma/client'
import { findCompletedStepOutput } from './step-outputs'

function makeStep(overrides: Partial<PipelineStep>): PipelineStep {
  return {
    id: 'step-1',
    runId: 'run-1',
    type: StepType.OUTLINE,
    order: 3,
    status: StepStatus.PENDING,
    attempt: 0,
    input: null,
    output: null,
    error: null,
    heartbeatAt: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

describe('findCompletedStepOutput', () => {
  it("renvoie l'output de l'étape complétée demandée", () => {
    const outline = { h1: 'Titre', sections: [] }
    const steps = [makeStep({ type: StepType.OUTLINE, status: StepStatus.COMPLETED, output: outline })]

    expect(findCompletedStepOutput(steps, StepType.OUTLINE, 'run-1')).toEqual(outline)
  })

  it('choisit la tentative la plus récente (attempt le plus élevé) quand plusieurs existent', () => {
    const steps = [
      makeStep({ id: 'a', type: StepType.OUTLINE, status: StepStatus.COMPLETED, attempt: 0, output: { h1: 'Ancien' } }),
      makeStep({ id: 'b', type: StepType.OUTLINE, status: StepStatus.COMPLETED, attempt: 1, output: { h1: 'Récent' } }),
    ]

    expect(findCompletedStepOutput<{ h1: string }>(steps, StepType.OUTLINE, 'run-1').h1).toBe('Récent')
  })

  it("échoue explicitement si aucune étape de ce type n'existe", () => {
    expect(() => findCompletedStepOutput([], StepType.OUTLINE, 'run-1')).toThrow(/OUTLINE/)
  })

  it("échoue explicitement si l'étape existe mais n'est pas encore complétée", () => {
    const steps = [makeStep({ type: StepType.OUTLINE, status: StepStatus.RUNNING, output: null })]
    expect(() => findCompletedStepOutput(steps, StepType.OUTLINE, 'run-1')).toThrow(/OUTLINE/)
  })

  it('échoue explicitement si une étape complétée existe mais sans output persisté', () => {
    const steps = [makeStep({ type: StepType.OUTLINE, status: StepStatus.COMPLETED, output: null })]
    expect(() => findCompletedStepOutput(steps, StepType.OUTLINE, 'run-1')).toThrow(/OUTLINE/)
  })
})
