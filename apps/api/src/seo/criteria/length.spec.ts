import { parse } from '../../markdown'
import { evaluateLength } from './length'
import type { SeoContext } from '../types'

const ctx: SeoContext = {
  seoTitle: null,
  metaDescription: null,
  focusKeyword: null,
  slug: 'article',
  language: 'fr',
}

function words(count: number): string {
  return Array.from({ length: count }, () => 'mot').join(' ')
}

describe('evaluateLength', () => {
  it('bloque en dessous de 300 mots', () => {
    const result = evaluateLength(parse(words(299)), ctx)

    expect(result.code).toBe('LENGTH')
    expect(result.earned).toBe(0)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'CONTENT_TOO_SHORT', severity: 'BLOCKING' }),
    ])
  })

  it('note le plein score à partir de 600 mots', () => {
    const result = evaluateLength(parse(words(600)), ctx)

    expect(result.max).toBe(10)
    expect(result.earned).toBe(10)
    expect(result.issues).toEqual([])
  })

  it('note un score intermédiaire entre 300 et 600 mots, sans bloquer', () => {
    const result = evaluateLength(parse(words(450)), ctx)

    expect(result.issues).toEqual([])
    expect(result.earned).toBeGreaterThan(0)
    expect(result.earned).toBeLessThan(10)
  })

  it('gère un document vide sans lever', () => {
    expect(() => evaluateLength(parse(''), ctx)).not.toThrow()
    const result = evaluateLength(parse(''), ctx)
    expect(result.issues[0]?.code).toBe('CONTENT_TOO_SHORT')
  })
})
