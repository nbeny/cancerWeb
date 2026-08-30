'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { TopicFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

interface Props {
  domainId: string
  topics: TopicFieldsFragment[]
  totalCount: number
  page: number
  pageSize: number
  emptyState: ReactNode
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Composant client : les actions (sélectionner, rejeter, rédiger l'article)
// appellent des mutations via `browserSdk` et pilotent un ConfirmDialog / des
// Toast, ce qui exige une frontière 'use client'. Les colonnes de DataTable
// sont donc définies ici plutôt que dans la page serveur — un Server
// Component ne peut pas passer de fonctions arbitraires (render de colonne) à
// un Client Component, seules des valeurs sérialisables ou des Server
// Actions le peuvent.
export function TopicsTable({ domainId, topics, totalCount, page, pageSize, emptyState }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [rejecting, setRejecting] = useState<TopicFieldsFragment | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleSelect = async (topic: TopicFieldsFragment) => {
    setBusyId(topic.id)
    try {
      await browserSdk.SelectTopic({ domainId, id: topic.id })
      showToast({ title: 'Sujet sélectionné', variant: 'success' })
      router.refresh()
    } catch (error) {
      showToast({
        title: 'Échec de la sélection',
        description: graphqlErrorCode(error) ?? undefined,
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  const confirmReject = async () => {
    if (!rejecting) return
    const topic = rejecting
    setBusyId(topic.id)
    try {
      await browserSdk.RejectTopic({ domainId, id: topic.id })
      showToast({ title: 'Sujet rejeté', variant: 'success' })
      setRejecting(null)
      router.refresh()
    } catch {
      showToast({ title: 'Échec du rejet', variant: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  const handleWriteArticle = async (topic: TopicFieldsFragment) => {
    setBusyId(topic.id)
    try {
      const { data } = await browserSdk.CreateArticle({
        domainId,
        input: {
          title: topic.title,
          // `content` est requis (au moins 1 caractère) : on part de l'angle
          // suggéré ou de la description du sujet, à défaut d'un texte de
          // départ générique — l'éditeur (Task 16) permettra de le compléter.
          content: topic.suggestedAngle || topic.description || 'Contenu à rédiger.',
          topicId: topic.id,
        },
      })
      showToast({ title: 'Article créé, rédaction en cours', variant: 'success' })
      // `domainId` conservé dans l'URL de la page d'édition (Task 16), comme
      // partout ailleurs dans le dashboard : sans lui, `/dashboard/articles/[id]`
      // ne peut pas savoir avec quel domaine interroger `article(domainId, id)`.
      router.push(`/dashboard/articles/${data.createArticle.id}?domainId=${domainId}`)
    } catch {
      showToast({ title: 'Échec de la création de l’article', variant: 'error' })
      setBusyId(null)
    }
  }

  const columns: DataTableColumn<TopicFieldsFragment>[] = [
    {
      key: 'title',
      header: 'Titre',
      render: (topic) => (
        <div>
          <p className="font-medium text-slate-900">{topic.title}</p>
          {topic.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{topic.description}</p>}
        </div>
      ),
    },
    { key: 'status', header: 'Statut', render: (topic) => <StatusBadge status={topic.status} /> },
    {
      key: 'estimatedDifficulty',
      header: 'Difficulté',
      render: (topic) => topic.estimatedDifficulty ?? '—',
    },
    {
      key: 'estimatedInterest',
      header: 'Intérêt',
      render: (topic) => topic.estimatedInterest ?? '—',
    },
    {
      key: 'createdAt',
      header: 'Créé le',
      render: (topic) => DATE_FORMAT.format(new Date(topic.createdAt)),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (topic) => (
        <div className="flex flex-wrap gap-2">
          {topic.status === 'IDEA' && (
            <Button variant="secondary" onClick={() => handleSelect(topic)} loading={busyId === topic.id}>
              Sélectionner
            </Button>
          )}
          {(topic.status === 'IDEA' || topic.status === 'SELECTED') && (
            <Button variant="danger" onClick={() => setRejecting(topic)} loading={busyId === topic.id}>
              Rejeter
            </Button>
          )}
          {topic.status === 'SELECTED' && (
            <Button variant="primary" onClick={() => handleWriteArticle(topic)} loading={busyId === topic.id}>
              Rédiger l’article
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={topics}
        rowKey={(topic) => topic.id}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        emptyState={emptyState}
        caption="Idées d’articles"
      />
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title="Rejeter ce sujet ?"
        description={rejecting ? `« ${rejecting.title} » sera marqué comme rejeté.` : undefined}
        confirmLabel="Rejeter"
        variant="danger"
        loading={rejecting !== null && busyId === rejecting.id}
        onConfirm={confirmReject}
      />
    </>
  )
}
