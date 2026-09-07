import { FakeAIProvider } from './providers/fake.provider'
import { AITaskService } from './ai-task.service'
import { makeDomain, makeTopic } from './test-fixtures'

const ENV_KEYS = ['AI_FAKE_LATENCY_MS', 'AI_FAKE_FAIL_STEP', 'AI_FAKE_INVALID_OUTLINE'] as const

function clearFakeEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key]
}

describe('AITaskService', () => {
  let provider: FakeAIProvider
  let service: AITaskService

  beforeEach(() => {
    clearFakeEnv()
    provider = new FakeAIProvider()
    service = new AITaskService(provider)
  })

  afterEach(() => {
    clearFakeEnv()
  })

  describe('generateTopics', () => {
    it('renvoie les sujets parsés depuis la fixture JSON du provider', async () => {
      const topics = await service.generateTopics(makeDomain(), 3)
      expect(topics.length).toBeGreaterThan(0)
      expect(topics[0]).toHaveProperty('title')
      expect(typeof topics[0]?.title).toBe('string')
    })
  })

  describe('generateOutline', () => {
    it('chemin nominal : renvoie un Outline structuré à partir du plan valide', async () => {
      const outline = await service.generateOutline(makeDomain(), makeTopic())
      expect(outline.h1.length).toBeGreaterThan(0)
      expect(outline.sections.length).toBeGreaterThanOrEqual(2)
    })

    it('relance une seule fois avec la raison du rejet quand le premier plan est invalide, puis réussit si le second est valide', async () => {
      process.env.AI_FAKE_INVALID_OUTLINE = '1'
      const completeSpy = jest.spyOn(provider, 'complete')
      const original = completeSpy.getMockImplementation() ?? provider.complete.bind(provider)

      completeSpy.mockImplementation(async (req) => {
        const callNumber = completeSpy.mock.calls.length
        // Simule un modèle qui se corrige après avoir reçu la raison exacte du rejet.
        if (callNumber === 2) delete process.env.AI_FAKE_INVALID_OUTLINE
        return original(req)
      })

      const outline = await service.generateOutline(makeDomain(), makeTopic())

      expect(completeSpy).toHaveBeenCalledTimes(2)
      expect(outline.h1.length).toBeGreaterThan(0)

      const retryPrompt = completeSpy.mock.calls[1]?.[0]?.prompt ?? ''
      expect(retryPrompt).toMatch(/H1/) // la raison du rejet (deux H1) est renvoyée au modèle
      expect(retryPrompt).toContain('[[OUTLINE]]')
    })

    it('échoue proprement après la relance si le second plan est encore invalide', async () => {
      process.env.AI_FAKE_INVALID_OUTLINE = '1'
      const completeSpy = jest.spyOn(provider, 'complete')

      await expect(service.generateOutline(makeDomain(), makeTopic())).rejects.toThrow(/relance|H1/i)
      expect(completeSpy).toHaveBeenCalledTimes(2)
    })

    it('propage le correlationId identique sur la tentative initiale et sur la relance', async () => {
      process.env.AI_FAKE_INVALID_OUTLINE = '1'
      const completeSpy = jest.spyOn(provider, 'complete')

      await expect(service.generateOutline(makeDomain(), makeTopic(), 'corr-123')).rejects.toThrow()

      expect(completeSpy).toHaveBeenCalledTimes(2)
      expect(completeSpy.mock.calls[0]?.[0]?.correlationId).toBe('corr-123')
      expect(completeSpy.mock.calls[1]?.[0]?.correlationId).toBe('corr-123')
    })
  })

  describe('generateDraft', () => {
    it('chemin nominal : renvoie le Markdown produit par le provider', async () => {
      const outline = await service.generateOutline(makeDomain(), makeTopic())
      const draft = await service.generateDraft(makeDomain(), makeTopic(), outline)
      expect(draft).toMatch(/^# /)
      expect(draft.split(/\s+/).length).toBeGreaterThan(50)
    })
  })
})
