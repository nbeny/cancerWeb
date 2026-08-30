import { parse } from '../../markdown'
import { evaluateHeadings } from './headings'
import type { SeoContext } from '../types'

const ctx: SeoContext = {
  seoTitle: null,
  metaDescription: null,
  focusKeyword: null,
  slug: 'article',
  language: 'fr',
}

describe('evaluateHeadings', () => {
  it('note le plein score pour exactement un H1 sans saut de niveau', () => {
    const md = ['# Titre', '', '## Section A', '', '### Sous-section'].join('\n')
    const result = evaluateHeadings(parse(md), ctx)

    expect(result.code).toBe('HEADINGS')
    expect(result.max).toBe(15)
    expect(result.earned).toBe(15)
    expect(result.issues).toEqual([])
  })

  it('bloque quand aucun H1 n\'est présent', () => {
    const md = ['## Section A'].join('\n')
    const result = evaluateHeadings(parse(md), ctx)

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'H1_MISSING', severity: 'BLOCKING' }),
    )
  })

  it("bloque quand il y a plusieurs H1", () => {
    const md = ['# Premier', '', '# Second'].join('\n')
    const result = evaluateHeadings(parse(md), ctx)

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'H1_MULTIPLE', severity: 'BLOCKING' }),
    )
  })

  it('signale un saut de niveau (H2 vers H4)', () => {
    const md = ['# Titre', '', '## Section', '', '#### Sous-section trop profonde'].join('\n')
    const result = evaluateHeadings(parse(md), ctx)

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'HEADING_LEVEL_SKIPPED', severity: 'WARNING' }),
    )
  })

  it('gère un document sans aucun titre sans lever', () => {
    expect(() => evaluateHeadings(parse(''), ctx)).not.toThrow()
    const result = evaluateHeadings(parse(''), ctx)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'H1_MISSING' }))
  })
})
