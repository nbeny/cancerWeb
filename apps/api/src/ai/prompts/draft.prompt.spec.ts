import { makeDomain, makeTopic } from '../test-fixtures'
import type { Outline } from '../ai-task.types'
import { buildDraftPrompt, DRAFT_PROMPT_VERSION } from './draft.prompt'

const outline: Outline = {
  h1: "Comprendre l'immunothérapie moderne",
  sections: [
    { title: "Qu'est-ce que l'immunothérapie ?", depth: 2 },
    { title: 'Les principaux types de traitements', depth: 2 },
    { title: 'Inhibiteurs de points de contrôle', depth: 3 },
  ],
}

describe('buildDraftPrompt', () => {
  it('contient le marqueur reconnu par FakeAIProvider', () => {
    const prompt = buildDraftPrompt(makeDomain(), makeTopic(), outline)
    expect(prompt).toContain('[[DRAFT]]')
  })

  it('injecte les consignes du domaine', () => {
    const domain = makeDomain({ language: 'es', aiInstructions: 'Toujours citer une source institutionnelle.' })
    const prompt = buildDraftPrompt(domain, makeTopic(), outline)
    expect(prompt).toMatch(/es/)
    expect(prompt).toMatch(/Toujours citer une source institutionnelle\./)
  })

  it('nomme explicitement les sujets exclus quand le domaine en a', () => {
    const domain = makeDomain({ excludedTopics: ['Régimes miracle'] })
    const prompt = buildDraftPrompt(domain, makeTopic(), outline)
    expect(prompt).toMatch(/Régimes miracle/)
  })

  it('reproduit fidèlement le plan validé, avec sa hiérarchie de titres', () => {
    const prompt = buildDraftPrompt(makeDomain(), makeTopic(), outline)
    expect(prompt).toContain(`# ${outline.h1}`)
    expect(prompt).toContain(`## Qu'est-ce que l'immunothérapie ?`)
    expect(prompt).toContain('### Inhibiteurs de points de contrôle')
  })

  it("demande un article complet en Markdown", () => {
    const prompt = buildDraftPrompt(makeDomain(), makeTopic(), outline)
    expect(prompt).toMatch(/markdown/i)
    expect(prompt).toMatch(/article/i)
  })

  it('exporte une version de prompt stable', () => {
    expect(DRAFT_PROMPT_VERSION).toBe('DRAFT_V1')
  })
})
