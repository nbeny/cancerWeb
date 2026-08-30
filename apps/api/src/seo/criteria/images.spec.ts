import { parse } from '../../markdown'
import { evaluateImages } from './images'
import type { SeoContext } from '../types'

const ctx: SeoContext = {
  seoTitle: null,
  metaDescription: null,
  focusKeyword: null,
  slug: 'article',
  language: 'fr',
}

describe('evaluateImages', () => {
  it("note le plein score quand il n'y a aucune image", () => {
    const result = evaluateImages(parse('Un texte sans image.'), ctx)

    expect(result.code).toBe('IMAGES')
    expect(result.max).toBe(5)
    expect(result.earned).toBe(5)
    expect(result.issues).toEqual([])
  })

  it('note le plein score quand toutes les images ont un alt', () => {
    const md = '![un chat](chat.png) et ![un chien](chien.png)'
    const result = evaluateImages(parse(md), ctx)

    expect(result.earned).toBe(5)
  })

  it("signale une image sans texte alternatif", () => {
    const md = '![](img.png)'
    const result = evaluateImages(parse(md), ctx)

    expect(result.earned).toBe(0)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'IMAGE_ALT_MISSING', severity: 'WARNING' }),
    ])
  })
})
