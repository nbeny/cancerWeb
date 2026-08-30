import type { ArticleListFieldsFragment } from '@cancerweb/graphql'
import {
  matchesArticleFilters,
  paginate,
  parseArticleFilters,
  parseArticleSort,
  sortArticles,
} from './filters'

function article(overrides: Partial<ArticleListFieldsFragment>): ArticleListFieldsFragment {
  return {
    id: '1',
    title: 'Titre',
    slug: 'titre',
    status: 'DRAFT',
    latestSeoScore: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    publishedAt: null,
    author: { id: 'author-1', name: 'Alice' },
    category: null,
    ...overrides,
  }
}

describe('parseArticleFilters', () => {
  it('ignore les paramètres absents', () => {
    expect(parseArticleFilters({})).toEqual({
      status: undefined,
      authorId: undefined,
      categoryId: undefined,
      minScore: undefined,
    })
  })

  it('lit chaque filtre depuis les paramètres de recherche', () => {
    expect(
      parseArticleFilters({ status: 'PUBLISHED', author: 'author-1', category: 'cat-1', minScore: '80' }),
    ).toEqual({ status: 'PUBLISHED', authorId: 'author-1', categoryId: 'cat-1', minScore: 80 })
  })

  it('ignore un minScore non numérique plutôt que de planter', () => {
    expect(parseArticleFilters({ minScore: 'oops' }).minScore).toBeUndefined()
  })
})

describe('matchesArticleFilters', () => {
  it('accepte tout article quand aucun filtre n’est actif', () => {
    expect(matchesArticleFilters(article({}), {})).toBe(true)
  })

  it('filtre par statut', () => {
    expect(matchesArticleFilters(article({ status: 'DRAFT' }), { status: 'PUBLISHED' })).toBe(false)
    expect(matchesArticleFilters(article({ status: 'PUBLISHED' }), { status: 'PUBLISHED' })).toBe(true)
  })

  it('filtre par auteur', () => {
    expect(matchesArticleFilters(article({ author: { id: 'a1', name: 'Alice' } }), { authorId: 'a2' })).toBe(false)
    expect(matchesArticleFilters(article({ author: { id: 'a1', name: 'Alice' } }), { authorId: 'a1' })).toBe(true)
  })

  it('filtre par catégorie, y compris quand l’article n’en a pas', () => {
    expect(matchesArticleFilters(article({ category: null }), { categoryId: 'c1' })).toBe(false)
    expect(
      matchesArticleFilters(article({ category: { id: 'c1', name: 'SEO' } }), { categoryId: 'c1' }),
    ).toBe(true)
  })

  it('exclut un article jamais analysé quand un score minimum est demandé', () => {
    expect(matchesArticleFilters(article({ latestSeoScore: null }), { minScore: 0 })).toBe(false)
  })

  it('applique le score minimum aux articles analysés', () => {
    expect(matchesArticleFilters(article({ latestSeoScore: 40 }), { minScore: 50 })).toBe(false)
    expect(matchesArticleFilters(article({ latestSeoScore: 60 }), { minScore: 50 })).toBe(true)
  })
})

describe('parseArticleSort', () => {
  it('trie par date de création descendante par défaut', () => {
    expect(parseArticleSort(undefined)).toEqual({ key: 'createdAt', direction: -1 })
  })

  it('reconnaît une clé ascendante', () => {
    expect(parseArticleSort('title')).toEqual({ key: 'title', direction: 1 })
  })

  it('reconnaît le préfixe "-" comme un tri descendant', () => {
    expect(parseArticleSort('-latestSeoScore')).toEqual({ key: 'latestSeoScore', direction: -1 })
  })

  it('retombe sur le tri par défaut pour une clé inconnue', () => {
    expect(parseArticleSort('unknownField')).toEqual({ key: 'createdAt', direction: -1 })
  })
})

describe('sortArticles', () => {
  const a = article({ id: 'a', title: 'Beta', latestSeoScore: 40, createdAt: '2026-01-02T00:00:00Z' })
  const b = article({ id: 'b', title: 'Alpha', latestSeoScore: null, createdAt: '2026-01-01T00:00:00Z' })
  const c = article({ id: 'c', title: 'Charlie', latestSeoScore: 80, createdAt: '2026-01-03T00:00:00Z' })

  it('trie par titre alphabétique', () => {
    expect(sortArticles([a, b, c], { key: 'title', direction: 1 }).map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('trie par date de création', () => {
    expect(sortArticles([a, b, c], { key: 'createdAt', direction: 1 }).map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(sortArticles([a, b, c], { key: 'createdAt', direction: -1 }).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('relègue les scores SEO non calculés en fin de liste, dans les deux sens', () => {
    expect(sortArticles([a, b, c], { key: 'latestSeoScore', direction: 1 }).map((x) => x.id)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(sortArticles([a, b, c], { key: 'latestSeoScore', direction: -1 }).map((x) => x.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const input = [c, a, b]
    const copy = [...input]
    sortArticles(input, { key: 'title', direction: 1 })
    expect(input).toEqual(copy)
  })
})

describe('paginate', () => {
  it('découpe une liste en pages de taille fixe', () => {
    const items = [1, 2, 3, 4, 5]
    expect(paginate(items, 1, 2)).toEqual([1, 2])
    expect(paginate(items, 2, 2)).toEqual([3, 4])
    expect(paginate(items, 3, 2)).toEqual([5])
  })

  it('renvoie un tableau vide au-delà de la dernière page', () => {
    expect(paginate([1, 2], 5, 2)).toEqual([])
  })
})
