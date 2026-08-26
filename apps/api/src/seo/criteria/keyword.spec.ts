import { parse } from '../../markdown'
import { evaluateKeyword } from './keyword'
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

describe('evaluateKeyword', () => {
  it('est neutralisé (skipped) quand focusKeyword est null, sans note 0', () => {
    const result = evaluateKeyword(parse('# Titre\n\nUn peu de texte.'), ctx({ focusKeyword: null }))

    expect(result.code).toBe('KEYWORD')
    expect(result.skipped).toBe(true)
    expect(result.max).toBe(15)
  })

  it('note le plein score quand le mot-clé est dans le H1, l\'intro et à bonne densité', () => {
    const filler = Array.from({ length: 40 }, () => 'Le chat dort paisiblement sur le tapis chaud.').join(' ')
    const md = [
      '# Randonnée en montagne : le guide complet',
      '',
      'La randonnée est une activité idéale pour se détendre en plein air, en pleine nature.',
      '',
      filler,
    ].join('\n')

    const result = evaluateKeyword(parse(md), ctx({ focusKeyword: 'randonnée' }))

    expect(result.max).toBe(15)
    expect(result.earned).toBe(15)
    expect(result.issues).toEqual([])
  })

  it("signale l'absence du mot-clé dans le H1", () => {
    const md = '# Un titre quelconque\n\nUn texte sans rapport.'
    const result = evaluateKeyword(parse(md), ctx({ focusKeyword: 'randonnée' }))

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KEYWORD_MISSING_IN_H1' }))
  })

  it("signale l'absence du mot-clé dans les 100 premiers mots", () => {
    const filler = Array.from({ length: 110 }, () => 'mot').join(' ')
    const md = `# Un titre sans le mot-clé\n\n${filler} randonnée`
    const result = evaluateKeyword(parse(md), ctx({ focusKeyword: 'randonnée' }))

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KEYWORD_MISSING_IN_INTRO' }))
  })

  it('signale une densité hors plage (mot-clé absent du corps -> densité 0)', () => {
    const md = '# Randonnée\n\nUn texte qui ne répète jamais le mot-clé dans le corps.'
    const result = evaluateKeyword(parse(md), ctx({ focusKeyword: 'randonnée' }))

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KEYWORD_DENSITY_OUT_OF_RANGE' }))
  })

  it("ne compte pas 'seo' dans 'seomanager' pour la densité", () => {
    const filler = Array.from({ length: 50 }, () => 'seomanager').join(' ')
    const md = `# Titre\n\n${filler}`
    const result = evaluateKeyword(parse(md), ctx({ focusKeyword: 'seo' }))

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KEYWORD_DENSITY_OUT_OF_RANGE' }))
  })
})
