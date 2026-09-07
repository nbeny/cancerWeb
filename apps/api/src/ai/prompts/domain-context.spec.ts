import { ExpertiseLevel, Tone } from '@prisma/client'
import { makeDomain } from '../test-fixtures'
import { buildDomainContextBlock } from './domain-context'

describe('buildDomainContextBlock', () => {
  it('mentionne la langue, le ton et le niveau d\'expertise du domaine', () => {
    const block = buildDomainContextBlock(makeDomain({ language: 'en', tone: Tone.TECHNICAL, expertiseLevel: ExpertiseLevel.EXPERT }))
    expect(block).toMatch(/en/)
    expect(block).toMatch(/technique/i)
    expect(block).toMatch(/expert/i)
  })

  it("mentionne l'audience visée quand elle est renseignée", () => {
    const block = buildDomainContextBlock(makeDomain({ targetAudience: ['patients', 'aidants'] }))
    expect(block).toMatch(/patients/)
    expect(block).toMatch(/aidants/)
  })

  it("mentionne les instructions libres de l'éditeur quand elles sont renseignées", () => {
    const block = buildDomainContextBlock(makeDomain({ aiInstructions: 'Toujours citer une source institutionnelle.' }))
    expect(block).toMatch(/Toujours citer une source institutionnelle\./)
  })

  it('présente les sujets exclus comme une contrainte explicite, pas une suggestion', () => {
    const block = buildDomainContextBlock(makeDomain({ excludedTopics: ['Homéopathie', "Régimes miracle"] }))
    expect(block).toMatch(/Homéopathie/)
    expect(block).toMatch(/Régimes miracle/)
    expect(block).toMatch(/interdit|jamais|contrainte/i)
  })

  it("n'affiche pas de section sujets exclus quand la liste est vide", () => {
    const block = buildDomainContextBlock(makeDomain({ excludedTopics: [] }))
    expect(block).not.toMatch(/interdit/i)
  })
})
