import { parse } from '../../markdown'
import { evaluateReadability } from './readability'
import type { SeoContext } from '../types'

const ctx: SeoContext = {
  seoTitle: null,
  metaDescription: null,
  focusKeyword: null,
  slug: 'article',
  language: 'fr',
}

describe('evaluateReadability', () => {
  it('déclare le poids maximal du critère (10), même neutralisé', () => {
    const result = evaluateReadability(parse('Un texte quelconque.'), ctx)

    expect(result.code).toBe('READABILITY')
    expect(result.max).toBe(10)
  })
})
