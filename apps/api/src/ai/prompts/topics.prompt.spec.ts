import { makeDomain } from '../test-fixtures'
import { buildTopicsPrompt, TOPICS_PROMPT_VERSION } from './topics.prompt'

describe('buildTopicsPrompt', () => {
  it('contient le marqueur reconnu par FakeAIProvider', () => {
    const prompt = buildTopicsPrompt(makeDomain(), 5)
    expect(prompt).toContain('[[TOPICS]]')
  })

  it('injecte les consignes du domaine (ton, expertise, audience, langue)', () => {
    const domain = makeDomain({ language: 'de', targetAudience: ['patients récemment diagnostiqués'] })
    const prompt = buildTopicsPrompt(domain, 3)
    expect(prompt).toMatch(/de/)
    expect(prompt).toMatch(/patients récemment diagnostiqués/)
  })

  it('nomme explicitement les sujets exclus quand le domaine en a', () => {
    const domain = makeDomain({ excludedTopics: ['Polémiques vaccinales'] })
    const prompt = buildTopicsPrompt(domain, 3)
    expect(prompt).toMatch(/Polémiques vaccinales/)
  })

  it('mentionne le nombre de sujets demandés', () => {
    const prompt = buildTopicsPrompt(makeDomain(), 7)
    expect(prompt).toContain('7')
  })

  it('exporte une version de prompt stable', () => {
    expect(TOPICS_PROMPT_VERSION).toBe('TOPICS_V1')
  })
})
