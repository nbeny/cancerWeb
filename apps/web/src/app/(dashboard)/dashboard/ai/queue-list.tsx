'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PipelineQueueQuery } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { STEP_LABELS } from '@/components/pipeline/step-labels'

type QueuedRun = PipelineQueueQuery['pipelineQueue'][number]

/** Formaté en minutes au-delà de 90s, sinon en secondes — une estimation en "412 secondes" ne se lit pas d'un coup d'œil. */
function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} s`
  return `${Math.round(seconds / 60)} min`
}

/**
 * File d'attente visible (Task 7) : runs en cours et en attente, avec leur
 * position et une estimation de temps restant — ou « estimation
 * indisponible » plutôt qu'un chiffre inventé quand `estimatedWaitSeconds`
 * vaut `null` (voir la jsdoc de `PipelineService.medianDurationMs` côté
 * API : sans historique suffisant, mieux vaut l'admettre que deviner).
 * L'annulation est toujours derrière une confirmation.
 */
export function QueueList({ domainId, queue }: { domainId: string; queue: QueuedRun[] }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<QueuedRun | null>(null)

  if (queue.length === 0) {
    return (
      <EmptyState
        title="Aucune génération en cours"
        description="Les générations d’articles ou d’idées lancées depuis les pages « Idées » apparaîtront ici pendant leur traitement."
      />
    )
  }

  const confirmCancel = async () => {
    if (!confirming) return
    const target = confirming
    setCancelling(target.run.id)
    try {
      await browserSdk.CancelPipelineRun({ domainId, id: target.run.id })
      showToast({ title: 'Génération annulée', variant: 'success' })
      setConfirming(null)
      router.refresh()
    } catch (error) {
      showToast({ title: 'Échec de l’annulation', description: graphqlErrorMessage(error) ?? undefined, variant: 'error' })
    } finally {
      setCancelling(null)
    }
  }

  return (
    <>
      <ol className="flex flex-col gap-3">
        {queue.map((entry) => (
          <li
            key={entry.run.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {entry.position}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={entry.run.status} />
                  <span className="text-sm text-slate-600">
                    {entry.run.currentStep ? STEP_LABELS[entry.run.currentStep] : 'En attente de démarrage'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Estimation :{' '}
                  {entry.estimatedWaitSeconds === null || entry.estimatedWaitSeconds === undefined
                    ? 'indisponible'
                    : formatWait(entry.estimatedWaitSeconds)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/ai/${entry.run.id}?domainId=${domainId}`}>
                <Button variant="secondary">Suivre</Button>
              </Link>
              <Button variant="danger" onClick={() => setConfirming(entry)} loading={cancelling === entry.run.id}>
                Annuler
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Annuler cette génération ?"
        description="L’étape en cours ira à son terme, mais aucune étape suivante ne sera lancée."
        confirmLabel="Annuler la génération"
        variant="danger"
        loading={confirming !== null && cancelling === confirming.run.id}
        onConfirm={confirmCancel}
      />
    </>
  )
}
