'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { PipelineRunFieldsFragment } from '@cancerweb/graphql'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { STEP_LABELS } from '@/components/pipeline/step-labels'

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Props {
  domainId: string
  runs: PipelineRunFieldsFragment[]
  totalCount: number
  page: number
  pageSize: number
  emptyState: ReactNode
}

/** Historique des runs (Task 7) : runs déjà terminés (COMPLETED/FAILED/CANCELLED) — les actifs vivent dans `QueueList`, jamais dupliqués ici (voir `page.tsx`, qui exclut les runs déjà présents dans `pipelineQueue`). */
export function HistoryTable({ domainId, runs, totalCount, page, pageSize, emptyState }: Props) {
  const columns: DataTableColumn<PipelineRunFieldsFragment>[] = [
    {
      key: 'kind',
      header: 'Genre',
      render: (run) => (run.topicId || run.articleId ? 'Article' : 'Sujets'),
    },
    { key: 'status', header: 'Statut', render: (run) => <StatusBadge status={run.status} /> },
    {
      key: 'lastStep',
      header: 'Dernière étape',
      render: (run) => {
        const last = [...run.steps].sort((a, b) => b.order - a.order).find((s) => s.status !== 'PENDING')
        return last ? STEP_LABELS[last.type] : '—'
      },
    },
    {
      key: 'createdAt',
      header: 'Lancé le',
      sortable: false,
      render: (run) => DATE_FORMAT.format(new Date(run.createdAt)),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (run) => (
        <Link href={`/dashboard/ai/${run.id}?domainId=${domainId}`}>
          <Button variant="secondary">Voir le détail</Button>
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={runs}
      rowKey={(run) => run.id}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      emptyState={emptyState}
      caption="Historique des générations"
    />
  )
}
