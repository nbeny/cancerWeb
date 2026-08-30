'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { ArticleListFieldsFragment } from '@cancerweb/graphql'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'

interface Props {
  domainId: string
  articles: ArticleListFieldsFragment[]
  totalCount: number
  page: number
  pageSize: number
  emptyState: ReactNode
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Composant client uniquement pour bénéficier de DataTable (tri/pagination
// pilotés par l'URL) : les colonnes sont définies ici, jamais dans la page
// serveur, pour la même raison que `topics-table.tsx` — un Server Component
// ne peut pas transmettre de fonctions de rendu à un Client Component.
export function ArticlesTable({ domainId, articles, totalCount, page, pageSize, emptyState }: Props) {
  const columns: DataTableColumn<ArticleListFieldsFragment>[] = [
    {
      key: 'title',
      header: 'Titre',
      sortable: true,
      render: (article) => (
        <Link
          href={`/dashboard/articles/${article.id}?domainId=${domainId}`}
          className="font-medium text-slate-900 hover:underline"
        >
          {article.title}
        </Link>
      ),
    },
    { key: 'status', header: 'Statut', render: (article) => <StatusBadge status={article.status} /> },
    { key: 'author', header: 'Auteur', render: (article) => article.author.name },
    { key: 'category', header: 'Catégorie', render: (article) => article.category?.name ?? '—' },
    {
      key: 'latestSeoScore',
      header: 'Score SEO',
      sortable: true,
      render: (article) =>
        article.latestSeoScore == null ? (
          <span className="italic text-slate-400">Non analysé</span>
        ) : (
          <span>{article.latestSeoScore}</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (article) => DATE_FORMAT.format(new Date(article.createdAt)),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={articles}
      rowKey={(article) => article.id}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      emptyState={emptyState}
      caption="Articles"
    />
  )
}
