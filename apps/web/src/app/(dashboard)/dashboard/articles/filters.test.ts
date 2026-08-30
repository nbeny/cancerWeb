import { hasActiveFilter, parseArticleFilter, parseArticleSort } from './filters'

describe('parseArticleFilter', () => {
  it('renvoie un filtre vide quand aucun paramètre n’est présent', () => {
    expect(parseArticleFilter({})).toEqual({})
  })

  it('lit chaque paramètre pris en charge', () => {
    expect(
      parseArticleFilter({ status: 'PUBLISHED', author: 'author-1', category: 'cat-1', minScore: '80', q: 'terme' }),
    ).toEqual({
      status: ['PUBLISHED'],
      authorId: 'author-1',
      categoryId: 'cat-1',
      minSeoScore: 80,
      search: 'terme',
    })
  })

  it('enveloppe le statut choisi (menu à sélection unique) dans un tableau', () => {
    expect(parseArticleFilter({ status: 'DRAFT' }).status).toEqual(['DRAFT'])
  })

  it('ignore un minScore non numérique plutôt que de planter', () => {
    expect(parseArticleFilter({ minScore: 'oops' }).minSeoScore).toBeUndefined()
  })

  it('ignore les paramètres vides', () => {
    expect(parseArticleFilter({ status: '', author: '', category: '', minScore: '', q: '' })).toEqual({})
  })
})

describe('hasActiveFilter', () => {
  it('est faux pour un filtre vide', () => {
    expect(hasActiveFilter({})).toBe(false)
  })

  it('est vrai dès qu’un champ est présent', () => {
    expect(hasActiveFilter({ search: 'terme' })).toBe(true)
    expect(hasActiveFilter({ minSeoScore: 0 })).toBe(true)
  })
})

describe('parseArticleSort', () => {
  it('renvoie undefined quand aucun tri n’est demandé', () => {
    expect(parseArticleSort(undefined)).toBeUndefined()
  })

  it('mappe une colonne triable vers ArticleSortField, ascendant par défaut', () => {
    expect(parseArticleSort('title')).toEqual({ field: 'TITLE', direction: 'ASC' })
    expect(parseArticleSort('createdAt')).toEqual({ field: 'CREATED_AT', direction: 'ASC' })
    expect(parseArticleSort('latestSeoScore')).toEqual({ field: 'SEO_SCORE', direction: 'ASC' })
  })

  it('reconnaît le préfixe "-" comme un tri descendant', () => {
    expect(parseArticleSort('-latestSeoScore')).toEqual({ field: 'SEO_SCORE', direction: 'DESC' })
  })

  it('renvoie undefined pour une colonne inconnue (laisse le tri par défaut serveur s’appliquer)', () => {
    expect(parseArticleSort('unknownField')).toBeUndefined()
    expect(parseArticleSort('-unknownField')).toBeUndefined()
  })
})
