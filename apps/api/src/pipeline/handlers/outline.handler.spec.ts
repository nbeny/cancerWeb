import { AITaskService } from '../../ai/ai-task.service'
import { FakeAIProvider } from '../../ai/providers/fake.provider'
import { makePipelineRun } from '../test-fixtures'
import { OutlineStepHandler } from './outline.handler'

describe('OutlineStepHandler', () => {
  it('expose le type OUTLINE', () => {
    const handler = new OutlineStepHandler(new AITaskService(new FakeAIProvider()))
    expect(handler.type).toBe('OUTLINE')
  })

  describe('buildInput', () => {
    it('lit le domaine et le sujet directement depuis le run', () => {
      const handler = new OutlineStepHandler(new AITaskService(new FakeAIProvider()))
      const run = makePipelineRun()

      const input = handler.buildInput(run, {})

      expect(input.domain).toBe(run.domain)
      expect(input.topic).toBe(run.topic)
    })

    it("échoue explicitement si le run n'a pas de sujet associé", () => {
      const handler = new OutlineStepHandler(new AITaskService(new FakeAIProvider()))
      const run = makePipelineRun({ topic: null })

      expect(() => handler.buildInput(run, {})).toThrow(/sujet|topic/i)
    })
  })

  describe('execute', () => {
    it("délègue à AITaskService.generateOutline et renvoie l'Outline structuré", async () => {
      const provider = new FakeAIProvider()
      const handler = new OutlineStepHandler(new AITaskService(provider))
      const run = makePipelineRun()
      const input = handler.buildInput(run, {})

      const outline = await handler.execute(input, {})

      expect(outline.h1.length).toBeGreaterThan(0)
      expect(outline.sections.length).toBeGreaterThanOrEqual(2)
    })

    it('propage le correlationId du contexte au provider', async () => {
      const provider = new FakeAIProvider()
      const completeSpy = jest.spyOn(provider, 'complete')
      const handler = new OutlineStepHandler(new AITaskService(provider))
      const run = makePipelineRun()
      const input = handler.buildInput(run, {})

      await handler.execute(input, { correlationId: 'corr-outline' })

      expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'corr-outline' }))
    })
  })
})
