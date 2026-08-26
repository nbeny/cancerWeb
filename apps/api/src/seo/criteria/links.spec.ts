import { parse } from '../../markdown'
import { evaluateLinks } from './links'
import type { SeoContext } from '../types'

const ctx: SeoContext = {
  seoTitle: null,
  metaDescription: null,
  focusKeyword: null,
  slug: 'article',
  language: 'fr',
}

describe('evaluateLinks', () => {
  it('note le plein score avec au moins un lien interne et un lien externe', () => {
    const md = '[interne](/articles/x) et [externe](https://ailleurs.fr)'
    const result = evaluateLinks(parse(md), ctx)

    expect(result.code).toBe('LINKS')
    expect(result.max).toBe(10)
    expect(result.earned).toBe(10)
    expect(result.issues).toEqual([])
  })

  it("signale l'absence de lien interne", () => {
    const md = '[externe](https://ailleurs.fr)'
    const result = evaluateLinks(parse(md), ctx)

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'INTERNAL_LINK_MISSING' }))
  })

  it("signale l'absence de lien externe", () => {
    const md = '[interne](/articles/x)'
    const result = evaluateLinks(parse(md), ctx)

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'EXTERNAL_LINK_MISSING' }))
  })

  it('gère un document sans aucun lien sans lever', () => {
    expect(() => evaluateLinks(parse(''), ctx)).not.toThrow()
    const result = evaluateLinks(parse(''), ctx)
    expect(result.earned).toBe(0)
  })
})
