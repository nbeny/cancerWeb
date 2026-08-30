import type { ArticleListFieldsFragment, ArticleStatus } from '@cancerweb/graphql'

// `ArticleFilter` côté API ne porte que `search` (recherche plein texte sur
// `Article.searchVector`) : il n'existe pas de filtre serveur par
// statut/auteur/catégorie/score minimum, ni de paramètre de tri sur
// `articles(...)` (voir packages/graphql/schema.graphql). Ces fonctions
// pures appliquent donc ces filtres et ce tri côté client, sur le lot déjà
// renvoyé par le serveur (voir `page.tsx` pour la stratégie de récupération
// et ses limites : au-delà d'un certain volume d'articles par domaine, un
// vrai filtrage serveur deviendrait nécessaire).

export interface ArticleFilters {
  status?: ArticleStatus
  authorId?: string
  categoryId?: string
  minScore?: number
}

function stringParam(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function parseArticleFilters(params: Record<string, string | string[] | undefined>): ArticleFilters {
  const rawMinScore = stringParam(params, 'minScore')
  const minScore = rawMinScore !== undefined && !Number.isNaN(Number(rawMinScore)) ? Number(rawMinScore) : undefined
  return {
    status: stringParam(params, 'status') as ArticleStatus | undefined,
    authorId: stringParam(params, 'author'),
    categoryId: stringParam(params, 'category'),
    minScore,
  }
}

export function matchesArticleFilters(article: ArticleListFieldsFragment, filters: ArticleFilters): boolean {
  if (filters.status && article.status !== filters.status) return false
  if (filters.authorId && article.author.id !== filters.authorId) return false
  if (filters.categoryId && article.category?.id !== filters.categoryId) return false
  if (filters.minScore != null) {
    // Un article jamais analysé (`latestSeoScore: null`) ne peut pas
    // satisfaire un score minimum : il n'y a pas de score à comparer, ce
    // n'est ni un 0 ni une exception au filtre.
    if (article.latestSeoScore == null || article.latestSeoScore < filters.minScore) return false
  }
  return true
}

export const ARTICLE_SORT_KEYS = ['title', 'createdAt', 'latestSeoScore'] as const
export type ArticleSortKey = (typeof ARTICLE_SORT_KEYS)[number]

export interface ParsedArticleSort {
  key: ArticleSortKey
  direction: 1 | -1
}

const DEFAULT_SORT: ParsedArticleSort = { key: 'createdAt', direction: -1 }

export function parseArticleSort(raw: string | undefined): ParsedArticleSort {
  if (!raw) return DEFAULT_SORT
  const direction: 1 | -1 = raw.startsWith('-') ? -1 : 1
  const key = raw.replace(/^-/, '')
  return (ARTICLE_SORT_KEYS as readonly string[]).includes(key)
    ? { key: key as ArticleSortKey, direction }
    : DEFAULT_SORT
}

export function sortArticles(
  articles: ArticleListFieldsFragment[],
  sort: ParsedArticleSort,
): ArticleListFieldsFragment[] {
  const { key, direction } = sort
  return [...articles].sort((a, b) => {
    if (key === 'title') return direction * a.title.localeCompare(b.title, 'fr')
    if (key === 'latestSeoScore') {
      // Les scores non calculés sont toujours relégués en fin de liste, quel
      // que soit le sens du tri : un article "jamais analysé" n'est ni
      // meilleur ni pire qu'un score numérique, il est hors classement.
      if (a.latestSeoScore == null && b.latestSeoScore == null) return 0
      if (a.latestSeoScore == null) return 1
      if (b.latestSeoScore == null) return -1
      return direction * (a.latestSeoScore - b.latestSeoScore)
    }
    return direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  })
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}
