import { makeDomain, makeTopic } from '../test-fixtures'
import { buildOutlinePrompt, buildOutlineRetryPrompt, OUTLINE_PROMPT_VERSION } from './outline.prompt'

describe('buildOutlinePrompt', () => {
  it('contient le marqueur reconnu par FakeAIProvider', () => {
    const prompt = buildOutlinePrompt(makeDomain(), makeTopic())
    expect(prompt).toContain('[[OUTLINE]]')
  })

  it('injecte les consignes du domaine (ton, expertise, audience, langue)', () => {
    const domain = makeDomain({ language: 'en', targetAudience: ['caregivers'] })
    const prompt = buildOutlinePrompt(domain, makeTopic())
    expect(prompt).toMatch(/en/)
    expect(prompt).toMatch(/caregivers/)
  })

  it("nomme explicitement les sujets exclus quand le domaine en a", () => {
    const domain = makeDomain({ excludedTopics: ['Homéopathie'] })
    const prompt = buildOutlinePrompt(domain, makeTopic())
    expect(prompt).toMatch(/Homéopathie/)
  })

  it('mentionne le sujet à traiter', () => {
    const topic = makeTopic({ title: 'Vivre avec un cancer chronique' })
    const prompt = buildOutlinePrompt(makeDomain(), topic)
    expect(prompt).toContain('Vivre avec un cancer chronique')
  })

  it('demande explicitement un plan Markdown, pas un article complet', () => {
    const prompt = buildOutlinePrompt(makeDomain(), makeTopic())
    expect(prompt).toMatch(/plan/i)
    expect(prompt).toMatch(/markdown/i)
  })

  it('exporte une version de prompt stable', () => {
    expect(OUTLINE_PROMPT_VERSION).toBe('OUTLINE_V1')
  })
})

describe('buildOutlineRetryPrompt', () => {
  it('contient toujours le marqueur, la raison du rejet et le plan rejeté', () => {
    const prompt = buildOutlineRetryPrompt(makeDomain(), makeTopic(), 'Le plan contient deux titres de niveau 1.', '# A\n# B')
    expect(prompt).toContain('[[OUTLINE]]')
    expect(prompt).toContain('Le plan contient deux titres de niveau 1.')
    expect(prompt).toContain('# A\n# B')
  })
})
