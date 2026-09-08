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

describe('buildTopicsPrompt — justification et anti-redite', () => {
  it('demande une justification ancrée dans le domaine', () => {
    const prompt = buildTopicsPrompt(makeDomain(), 3, [])
    expect(prompt).toMatch(/rationale/)
    expect(prompt).toMatch(/pourquoi/i)
  })

  it('liste les sujets déjà proposés avec une consigne de ne pas y revenir', () => {
    const prompt = buildTopicsPrompt(makeDomain(), 3, ['Zero Trust en entreprise', 'Phishing et IA'])
    expect(prompt).toContain('Zero Trust en entreprise')
    expect(prompt).toContain('Phishing et IA')
    expect(prompt).toMatch(/déjà proposés/i)
  })

  it("n'ajoute aucun bloc de redite quand le domaine n'a encore aucun sujet", () => {
    const prompt = buildTopicsPrompt(makeDomain(), 3, [])
    expect(prompt).not.toMatch(/déjà proposés/i)
  })
})
