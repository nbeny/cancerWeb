import { parse } from '../../markdown'
import { evaluateTitle } from './title'
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

describe('evaluateTitle', () => {
  it('note le plein score pour un titre de longueur correcte contenant le mot-clé', () => {
    const result = evaluateTitle(parse(''), ctx({ seoTitle: 'Guide complet de la randonnée en montagne', focusKeyword: 'randonnée' }))

    expect(result.code).toBe('TITLE')
    expect(result.max).toBe(20)
    expect(result.earned).toBe(20)
    expect(result.issues).toEqual([])
  })

  it('signale un titre trop court', () => {
    const result = evaluateTitle(parse(''), ctx({ seoTitle: 'Trop court', focusKeyword: null }))

    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'TITLE_LENGTH_OUT_OF_RANGE', severity: 'WARNING', field: 'seoTitle' }),
    ])
    expect(result.earned).toBe(0)
  })

  it('signale un titre trop long', () => {
    const longTitle = 'Un titre extrêmement long qui dépasse largement la limite recommandée de soixante caractères'
    const result = evaluateTitle(parse(''), ctx({ seoTitle: longTitle, focusKeyword: null }))

    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'TITLE_LENGTH_OUT_OF_RANGE' }),
    ])
  })

  it("signale l'absence du mot-clé focus dans le titre quand un mot-clé est défini", () => {
    const result = evaluateTitle(parse(''), ctx({ seoTitle: 'Guide complet de la randonnée en montagne', focusKeyword: 'cuisine' }))

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'TITLE_KEYWORD_MISSING', severity: 'WARNING', field: 'seoTitle' }),
    )
  })

  it("neutralise le sous-critère mot-clé (retire ses points du max) quand focusKeyword est null", () => {
    const result = evaluateTitle(parse(''), ctx({ seoTitle: 'Guide complet de la randonnée en montagne', focusKeyword: null }))

    expect(result.max).toBe(12)
    expect(result.earned).toBe(12)
    expect(result.issues).toEqual([])
  })

  it('gère un titre absent sans lever', () => {
    expect(() => evaluateTitle(parse(''), ctx({ seoTitle: null }))).not.toThrow()
    const result = evaluateTitle(parse(''), ctx({ seoTitle: null }))
    expect(result.earned).toBe(0)
  })
})
