'use client'

import type { ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Skeleton } from './skeleton'

export interface DataTableColumn<T> {
  /** Identifie la colonne dans l'URL de tri (`?sort=key` / `?sort=-key`). */
  key: string
  header: string
  sortable?: boolean
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Nombre total de lignes correspondant aux filtres actifs (pas seulement `rows.length`). */
  totalCount: number
  /** Page courante, 1-indexée. */
  page: number
  pageSize: number
  loading?: boolean
  emptyState?: ReactNode
  caption?: string
  /** Nom du paramètre d'URL portant le tri. Par défaut `sort`. */
  sortParam?: string
  /** Nom du paramètre d'URL portant la page. Par défaut `page`. */
  pageParam?: string
}

// Le tri et la pagination vivent dans l'URL (et non dans un `useState` local) :
// une vue filtrée doit être partageable par copier-coller et survivre à un
// rechargement de page. Ce composant lit `useSearchParams` pour son état et
// navigue via `useRouter`/`usePathname` plutôt que de garder son propre état —
// c'est la page appelante (Server Component) qui refait la requête avec les
// nouveaux paramètres et repasse des `rows` déjà triées/paginées.
function updateSearchParams(
  pathname: string,
  current: URLSearchParams,
  updates: Record<string, string | null>,
): string {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) next.delete(key)
    else next.set(key, value)
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  totalCount,
  page,
  pageSize,
  loading,
  emptyState,
  caption,
  sortParam = 'sort',
  pageParam = 'page',
}: DataTableProps<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const rawSort = searchParams.get(sortParam) ?? ''
  const sortKey = rawSort.replace(/^-/, '')
  const sortDir: 'asc' | 'desc' = rawSort.startsWith('-') ? 'desc' : 'asc'

  const toggleSort = (key: string) => {
    // Trois états par colonne : non triée -> ascendant -> descendant -> non
    // triée. `page` est remis à zéro : la page 3 d'un tri précédent n'a
    // aucune raison de rester pertinente pour un nouveau tri.
    let nextSort: string | null
    if (sortKey !== key) nextSort = key
    else if (sortDir === 'asc') nextSort = `-${key}`
    else nextSort = null
    router.push(updateSearchParams(pathname, searchParams, { [sortParam]: nextSort, [pageParam]: null }))
  }

  const goToPage = (nextPage: number) => {
    router.push(updateSearchParams(pathname, searchParams, { [pageParam]: nextPage > 1 ? String(nextPage) : null }))
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  if (loading) {
    return (
      <div className="flex flex-col gap-2" data-testid="data-table-loading">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((column) => {
                const isSorted = Boolean(column.sortable) && sortKey === column.key
                const ariaSort = column.sortable
                  ? isSorted
                    ? sortDir === 'asc'
                      ? ('ascending' as const)
                      : ('descending' as const)
                    : ('none' as const)
                  : undefined
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn('px-4 py-2 font-medium text-slate-600', column.className)}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        {column.header}
                        <span aria-hidden className="text-xs text-slate-400">
                          {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3 align-middle', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalCount > pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {totalCount} résultat{totalCount > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Précédent
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
