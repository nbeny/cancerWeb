import { parse } from '../../markdown'
import { evaluateReadability } from './readability'
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

const SIMPLE_FRENCH = 'Le chat dort. Il fait beau. Le chien court vite. Les enfants jouent dehors.'

describe('evaluateReadability', () => {
  it('déclare le poids maximal du critère (10)', () => {
    const result = evaluateReadability(parse(SIMPLE_FRENCH), ctx({ language: 'fr' }))

    expect(result.code).toBe('READABILITY')
    expect(result.max).toBe(10)
  })

  it('note un texte français simple sans le neutraliser', () => {
    const result = evaluateReadability(parse(SIMPLE_FRENCH), ctx({ language: 'fr' }))

    expect(result.skipped).toBeFalsy()
    expect(result.earned).toBeGreaterThan(0)
    expect(result.issues).toEqual([])
  })

  it("neutralise le critère et note une issue INFO pour une langue non couverte (ex. 'de')", () => {
    const result = evaluateReadability(parse(SIMPLE_FRENCH), ctx({ language: 'de' }))

    expect(result.skipped).toBe(true)
    expect(result.earned).toBe(0)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'READABILITY_LANGUAGE_UNSUPPORTED', severity: 'INFO' }),
    ])
  })

  it('gère un contenu vide sans lever', () => {
    expect(() => evaluateReadability(parse(''), ctx({ language: 'fr' }))).not.toThrow()
  })
})
