import { parse } from '../../markdown'
import { evaluateMetaDescription } from './meta-description'
import type { SeoContext } from '../types'

function ctx(overrides: Partial<SeoContext> = {}): SeoContext {
  return {
    seoTitle: null,
    metaDescription: null,
    focusKeyword: null,
    slug: 'article',
    language: 'fr',
    ...overrides,
  }
}

const GOOD_DESCRIPTION =
  'Découvrez notre guide complet de la randonnée en montagne : conseils pratiques, itinéraires simples et astuces pour bien préparer votre sortie.'

describe('evaluateMetaDescription', () => {
  it('note le plein score pour une description de bonne longueur contenant le mot-clé', () => {
    expect(GOOD_DESCRIPTION.length).toBeGreaterThanOrEqual(120)
    expect(GOOD_DESCRIPTION.length).toBeLessThanOrEqual(158)

    const result = evaluateMetaDescription(parse(''), ctx({ metaDescription: GOOD_DESCRIPTION, focusKeyword: 'randonnée' }))

    expect(result.code).toBe('META_DESCRIPTION')
    expect(result.max).toBe(15)
    expect(result.earned).toBe(15)
    expect(result.issues).toEqual([])
  })

  it('bloque et note 0 quand la meta description est absente', () => {
    const result = evaluateMetaDescription(parse(''), ctx({ metaDescription: null }))

    expect(result.earned).toBe(0)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'META_DESCRIPTION_MISSING', severity: 'BLOCKING', field: 'metaDescription' }),
    ])
  })

  it('signale une longueur hors plage', () => {
    const result = evaluateMetaDescription(parse(''), ctx({ metaDescription: 'Trop courte.', focusKeyword: null }))

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'META_DESCRIPTION_LENGTH_OUT_OF_RANGE', severity: 'WARNING' }),
    )
  })

  it("signale l'absence du mot-clé dans la description quand un mot-clé est défini", () => {
    const result = evaluateMetaDescription(parse(''), ctx({ metaDescription: GOOD_DESCRIPTION, focusKeyword: 'cuisine' }))

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'META_DESCRIPTION_KEYWORD_MISSING', severity: 'WARNING' }),
    )
  })

  it('neutralise le sous-critère mot-clé quand focusKeyword est null', () => {
    const result = evaluateMetaDescription(parse(''), ctx({ metaDescription: GOOD_DESCRIPTION, focusKeyword: null }))

    expect(result.max).toBe(10)
    expect(result.earned).toBe(10)
  })
})
