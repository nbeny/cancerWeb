import { StepStatus, StepType } from '@prisma/client'
import type { AIProvider, CompletionResult, ProviderHealth } from '../../ai/ai.types'
import { makeArticle, makePipelineRun, makePipelineStep } from '../test-fixtures'
import { SeoStepHandler } from './seo.handler'

const DRAFT_MARKDOWN = [
  '# Comprendre l\'immunothérapie moderne',
  '',
  "L'immunothérapie a profondément transformé la prise en charge de nombreux cancers.",
  '',
  '## Qu\'est-ce que l\'immunothérapie ?',
  'Un mécanisme qui mobilise le système immunitaire du patient.',
].join('\n')

/**
 * Provider IA "espionné" qui échoue si on l'appelle jamais : la preuve
 * runtime que `SeoStepHandler` n'invoque aucune IA, en plus de la preuve
 * structurelle que sa classe ne prend aucune dépendance IA en constructeur.
 */
function makeSpyAIProvider(): AIProvider & { complete: jest.Mock } {
  return {
    key: 'spy',
    complete: jest.fn<Promise<CompletionResult>, []>(() => {
      throw new Error("SeoStepHandler n'a pas le droit d'appeler un provider IA.")
    }),
    health: async (): Promise<ProviderHealth> => ({ ok: true }),
  }
}

describe('SeoStepHandler', () => {
  it('expose le type SEO', () => {
    expect(new SeoStepHandler().type).toBe('SEO')
  })

  describe('buildInput', () => {
    it("lit le brouillon persisté (DRAFT) et le contexte SEO de l'article, sans appeler le provider IA", () => {
      const spyProvider = makeSpyAIProvider()
      const handler = new SeoStepHandler()
      const draftStep = makePipelineStep({ type: StepType.DRAFT, status: StepStatus.COMPLETED, output: DRAFT_MARKDOWN })
      const article = makeArticle({ seoTitle: 'Titre SEO', metaDescription: 'Une description.', focusKeyword: 'immunothérapie', slug: 'mon-article' })
      const run = makePipelineRun({ steps: [draftStep], article })

      const input = handler.buildInput(run, {})

      expect(input.content).toBe(DRAFT_MARKDOWN)
      expect(input.context).toEqual({
        seoTitle: 'Titre SEO',
        metaDescription: 'Une description.',
        focusKeyword: 'immunothérapie',
        slug: 'mon-article',
        language: run.domain.language,
      })
      expect(spyProvider.complete).not.toHaveBeenCalled()
    })

    it("échoue explicitement si aucun DRAFT complété n'est persisté", () => {
      const handler = new SeoStepHandler()
      const run = makePipelineRun({ steps: [], article: makeArticle() })

      expect(() => handler.buildInput(run, {})).toThrow(/DRAFT/)
    })

    it("échoue explicitement si le run n'a pas encore d'article associé", () => {
      const handler = new SeoStepHandler()
      const draftStep = makePipelineStep({ type: StepType.DRAFT, status: StepStatus.COMPLETED, output: DRAFT_MARKDOWN })
      const run = makePipelineRun({ steps: [draftStep], article: null })

      expect(() => handler.buildInput(run, {})).toThrow(/article/i)
    })
  })

  describe('execute', () => {
    it('produit un rapport SEO déterministe sans jamais invoquer le provider IA espionné', async () => {
      const spyProvider = makeSpyAIProvider()
      const handler = new SeoStepHandler()
      const draftStep = makePipelineStep({ type: StepType.DRAFT, status: StepStatus.COMPLETED, output: DRAFT_MARKDOWN })
      const article = makeArticle({ seoTitle: 'Titre SEO', metaDescription: 'Une description.', focusKeyword: 'immunothérapie', slug: 'mon-article' })
      const run = makePipelineRun({ steps: [draftStep], article })
      const input = handler.buildInput(run, {})

      const report = await handler.execute(input, {})

      expect(typeof report.score).toBe('number')
      expect(Array.isArray(report.issues)).toBe(true)
      expect(spyProvider.complete).not.toHaveBeenCalled()
    })
  })
})
