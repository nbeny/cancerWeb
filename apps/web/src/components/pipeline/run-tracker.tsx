'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PipelineRunFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { usePipelineRunPolling } from './use-pipeline-run-polling'
import { PipelineProgress } from './pipeline-progress'
import { STEP_LABELS } from './step-labels'

const ACTIVE_STATUSES = new Set(['PENDING', 'RUNNING'])

/**
 * Suivi complet d'un run (Task 7) : se met à jour tout seul toutes les 2
 * secondes tant qu'il est actif (`usePipelineRunPolling`), affiche les 7
 * étapes (`PipelineProgress`) et permet d'annuler un run PENDING/RUNNING
 * derrière une confirmation — jamais pour un run déjà terminé.
 */
export function RunTracker({ domainId, run: initialRun }: { domainId: string; run: PipelineRunFieldsFragment }) {
  const run = usePipelineRunPolling(domainId, initialRun)
  const { showToast } = useToast()
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const canCancel = ACTIVE_STATUSES.has(run.status)

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await browserSdk.CancelPipelineRun({ domainId, id: run.id })
      showToast({ title: 'Génération annulée', variant: 'success' })
      setConfirmCancel(false)
    } catch (error) {
      showToast({ title: 'Échec de l’annulation', description: graphqlErrorMessage(error) ?? undefined, variant: 'error' })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          <span className="text-sm text-slate-600">
            {run.currentStep ? `Étape en cours : ${STEP_LABELS[run.currentStep]}` : 'Aucune étape en cours'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {run.articleId && (
            <Link href={`/dashboard/articles/${run.articleId}?domainId=${domainId}`}>
              <Button variant="secondary">Ouvrir l’article</Button>
            </Link>
          )}
          {canCancel && (
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Annuler
            </Button>
          )}
        </div>
      </div>

      <PipelineProgress domainId={domainId} runId={run.id} steps={run.steps} />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Annuler cette génération ?"
        description="L’étape en cours ira à son terme, mais aucune étape suivante ne sera lancée."
        confirmLabel="Annuler la génération"
        variant="danger"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  )
}
