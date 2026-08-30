import type { ArticleFilter, ArticleSort, ArticleSortField, ArticleStatus } from '@cancerweb/graphql'

// Filtrage ET tri ont lieu côté serveur (voir
// `apps/api/src/articles/article-query.ts`) : ce fichier ne fait plus que
// traduire les paramètres d'URL (lus par `page.tsx`/`DataTable`) vers les
// arguments GraphQL `filter`/`sort` — aucune logique de filtrage, de tri ou
// de pagination ne vit plus ici. Avant ce correctif, ce fichier appliquait
// tout ça en JavaScript sur un lot d'au plus 500 articles récupérés du
// serveur (voir l'historique Git) : silencieusement faux au-delà.

function stringParam(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Construit le `filter` GraphQL à partir des paramètres d'URL. `status` est
 * un unique statut choisi dans un menu déroulant côté UI, mais `ArticleFilter.status`
 * est un tableau côté serveur (il accepte plusieurs statuts) : on l'enveloppe
 * dans un tableau à un élément plutôt que d'exposer une UI multi-sélection
 * pour l'instant.
 */
export function parseArticleFilter(params: Record<string, string | string[] | undefined>): ArticleFilter {
  const filter: ArticleFilter = {}

  const status = stringParam(params, 'status')
  if (status) filter.status = [status as ArticleStatus]

  const authorId = stringParam(params, 'author')
  if (authorId) filter.authorId = authorId

  const categoryId = stringParam(params, 'category')
  if (categoryId) filter.categoryId = categoryId

  const rawMinScore = stringParam(params, 'minScore')
  const minSeoScore = rawMinScore !== undefined && !Number.isNaN(Number(rawMinScore)) ? Number(rawMinScore) : undefined
  if (minSeoScore != null) filter.minSeoScore = minSeoScore

  const search = stringParam(params, 'q')
  if (search) filter.search = search

  return filter
}

/** `true` si au moins un filtre (recherche incluse) est actif dans `filter`. */
export function hasActiveFilter(filter: ArticleFilter): boolean {
  return Object.keys(filter).length > 0
}

// Clés de colonnes `DataTable` (voir `articles-table.tsx`) triables, mappées
// vers `ArticleSortField` côté serveur. Seules les colonnes marquées
// `sortable: true` dans `articles-table.tsx` doivent apparaître ici.
const SORT_FIELD_BY_COLUMN: Record<string, ArticleSortField> = {
  title: 'TITLE',
  latestSeoScore: 'SEO_SCORE',
  createdAt: 'CREATED_AT',
}

/**
 * Traduit le paramètre d'URL `sort` porté par `DataTable` (`key` ou `-key`,
 * voir `components/ui/data-table.tsx`) en `ArticleSort` GraphQL. `undefined`
 * (pas de tri demandé, ou colonne inconnue) laisse le serveur appliquer son
 * tri par défaut (`createdAt` décroissant, voir `article-query.ts`).
 */
export function parseArticleSort(raw: string | undefined): ArticleSort | undefined {
  if (!raw) return undefined
  const direction = raw.startsWith('-') ? 'DESC' : 'ASC'
  const key = raw.replace(/^-/, '')
  const field = SORT_FIELD_BY_COLUMN[key]
  return field ? { field, direction } : undefined
}
