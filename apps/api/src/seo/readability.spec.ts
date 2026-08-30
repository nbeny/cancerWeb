import { readabilityScore } from './readability'

const SIMPLE_FRENCH =
  'Le chat dort. Il fait beau. Le chien court vite. Les enfants jouent dehors. On mange une pomme. Le ciel est bleu.'

const ADMINISTRATIVE_FRENCH =
  "Conformément aux dispositions réglementaires préalablement mentionnées dans le formulaire administratif, l'usager est tenu de fournir l'ensemble des justificatifs complémentaires nécessaires à l'instruction définitive et exhaustive de sa demande d'autorisation exceptionnelle."

describe('readabilityScore', () => {
  it("un texte français simple obtient un meilleur score qu'un texte administratif", () => {
    const simple = readabilityScore(SIMPLE_FRENCH, 'fr')
    const administrative = readabilityScore(ADMINISTRATIVE_FRENCH, 'fr')

    expect(simple.supported).toBe(true)
    expect(administrative.supported).toBe(true)
    expect(simple.score).toBeGreaterThan(administrative.score)
  })

  it('le même texte évalué en fr et en donne des scores différents', () => {
    const asFrench = readabilityScore(SIMPLE_FRENCH, 'fr')
    const asEnglish = readabilityScore(SIMPLE_FRENCH, 'en')

    expect(asFrench.supported).toBe(true)
    expect(asEnglish.supported).toBe(true)
    expect(asFrench.score).not.toBeCloseTo(asEnglish.score, 5)
  })

  it("une langue non couverte (ex. 'de') renvoie supported: false", () => {
    const result = readabilityScore(SIMPLE_FRENCH, 'de')

    expect(result.supported).toBe(false)
  })

  it('renvoie un résultat sans lever pour un texte vide', () => {
    expect(() => readabilityScore('', 'fr')).not.toThrow()
    const result = readabilityScore('', 'fr')
    expect(result.supported).toBe(true)
  })

  it('applique la formule Flesch standard en anglais', () => {
    const englishText = 'The cat sat on the mat. It was warm and quiet. The dog ran fast.'
    const result = readabilityScore(englishText, 'en')

    expect(result.supported).toBe(true)
    expect(Number.isFinite(result.score)).toBe(true)
  })
})
