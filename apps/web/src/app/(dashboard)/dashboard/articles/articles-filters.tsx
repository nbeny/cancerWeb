'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import type { ArticleStatus } from '@cancerweb/graphql'
import { Button } from '@/components/ui/button'

interface Option {
  id: string
  name: string
}

interface Props {
  domainId: string
  authors: Option[]
  categories: Option[]
}

const STATUSES: Array<[ArticleStatus, string]> = [
  ['DRAFT', 'Brouillon'],
  ['REVIEW', 'En revue'],
  ['APPROVED', 'Approuvé'],
  ['SCHEDULED', 'Programmé'],
  ['PUBLISHED', 'Publié'],
  ['ARCHIVED', 'Archivé'],
]

const FILTER_PARAMS = ['q', 'status', 'author', 'category', 'minScore']

export function ArticlesFilters({ domainId, authors, categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  const apply = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    next.set('domainId', domainId)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    // Toute modification de filtre repart de la page 1 : la page 4 des
    // résultats précédents n'a aucune raison d'être pertinente pour un
    // nouveau filtre.
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  const onSubmitSearch = (event: FormEvent) => {
    event.preventDefault()
    apply({ q: query.trim() || null })
  }

  const hasActiveFilters = FILTER_PARAMS.some((key) => searchParams.get(key))
  const clearFilters = () => router.push(`${pathname}?domainId=${domainId}`)

  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'

  return (
    <form onSubmit={onSubmitSearch} className="flex flex-wrap items-end gap-3" role="search">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Recherche</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Titre, contenu…"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Statut</span>
        <select
          value={searchParams.get('status') ?? ''}
          onChange={(event) => apply({ status: event.target.value || null })}
          className={field}
        >
          <option value="">Tous</option>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Auteur</span>
        <select
          value={searchParams.get('author') ?? ''}
          onChange={(event) => apply({ author: event.target.value || null })}
          className={field}
        >
          <option value="">Tous</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Catégorie</span>
        <select
          value={searchParams.get('category') ?? ''}
          onChange={(event) => apply({ category: event.target.value || null })}
          className={field}
        >
          <option value="">Toutes</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Score SEO min.</span>
        <input
          type="number"
          min={0}
          max={100}
          defaultValue={searchParams.get('minScore') ?? ''}
          onBlur={(event) => apply({ minScore: event.target.value || null })}
          className={`w-24 ${field}`}
        />
      </label>

      <Button type="submit" variant="secondary">
        Rechercher
      </Button>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={clearFilters}>
          Effacer les filtres
        </Button>
      )}
    </form>
  )
}
