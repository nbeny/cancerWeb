'use client'

import { useState } from 'react'
import { AlertTriangle, Ban, Check, Clock, Loader2, SkipForward } from 'lucide-react'
import type { PipelineStepFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/cn'
import { STEP_LABELS } from './step-labels'

interface Props {
  domainId: string
  runId: string
  steps: PipelineStepFieldsFragment[]
  /** Appelé après une relance réussie (`regenerateStep`) : la page appelante décide comment rafraîchir (polling, `router.refresh`...). */
  onStepRegenerated?: () => void
}

const ICON_CLASS = 'mt-0.5 h-5 w-5 shrink-0'

/**
 * Une seule icône par statut, choisie pour ne JAMAIS laisser croire qu'une
 * étape sautée a été vérifiée : `SKIPPED` utilise `SkipForward` (une flèche
 * qui saute), pas `Check` — c'est `Check` qui est réservé à `COMPLETED`. Voir
 * la jsdoc de `PipelineProgress` pour la garantie complète.
 */
function StepIcon({ status }: { status: PipelineStepFieldsFragment['status'] }) {
  switch (status) {
    case 'COMPLETED':
      return <Check className={cn(ICON_CLASS, 'text-emerald-600')} aria-hidden />
    case 'RUNNING':
      return <Loader2 className={cn(ICON_CLASS, 'animate-spin text-blue-600')} aria-hidden />
    case 'FAILED':
      return <AlertTriangle className={cn(ICON_CLASS, 'text-red-600')} aria-hidden />
    case 'CANCELLED':
      return <Ban className={cn(ICON_CLASS, 'text-slate-400')} aria-hidden />
    case 'SKIPPED':
      return <SkipForward className={cn(ICON_CLASS, 'text-slate-400')} aria-hidden />
    case 'PENDING':
    default:
      return <Clock className={cn(ICON_CLASS, 'text-slate-300')} aria-hidden />
  }
}

/**
 * Les 7 étapes du pipeline (Task 7), avec leur état. Garantie centrale,
 * reprise de la consigne du Lot 2 : une étape `SKIPPED` affiche TOUJOURS sa
 * raison (`step.error`, rédigée côté API pour être lue telle quelle — voir
 * `pipeline-steps.ts`), jamais une coche qui laisserait croire qu'elle a été
 * exécutée. Concrètement : `StepIcon` ne rend jamais `Check` pour `SKIPPED`
 * (voir ci-dessus), et le texte affiché commence explicitement par « Non
 * exécutée » suivi de la raison — jamais un simple libellé de statut muet.
 *
 * Une étape `FAILED` porte un bouton « Relancer cette étape », qui appelle
 * `regenerateStep` (Task 6) — la seule action corrective exposée ici, les
 * étapes non exécutables n'ont rien à relancer.
 */
export function PipelineProgress({ domainId, runId, steps, onStepRegenerated }: Props) {
  const { showToast } = useToast()
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const ordered = [...steps].sort((a, b) => a.order - b.order)

  const handleRetry = async (step: PipelineStepFieldsFragment) => {
    setRetryingId(step.id)
    try {
      await browserSdk.RegenerateStep({ domainId, runId, step: step.type })
      showToast({ title: 'Étape relancée', variant: 'success' })
      onStepRegenerated?.()
    } catch (error) {
      showToast({
        title: 'Échec de la relance',
        description: graphqlErrorMessage(error) ?? undefined,
        variant: 'error',
      })
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Étapes du pipeline">
      {ordered.map((step) => (
        <li key={step.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <StepIcon status={step.status} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{STEP_LABELS[step.type]}</p>

            {step.status === 'SKIPPED' && (
              <p className="mt-0.5 text-sm text-slate-500">Non exécutée : {step.error}</p>
            )}
            {step.status === 'PENDING' && <p className="mt-0.5 text-sm text-slate-400">En attente</p>}
            {step.status === 'RUNNING' && <p className="mt-0.5 text-sm text-blue-600">En cours…</p>}
            {step.status === 'CANCELLED' && <p className="mt-0.5 text-sm text-slate-400">Annulée</p>}
            {step.status === 'COMPLETED' && <p className="mt-0.5 text-sm text-emerald-600">Terminée</p>}
            {step.status === 'FAILED' && (
              <div className="mt-1 flex flex-col items-start gap-2">
                <p className="text-sm text-red-600">Échec : {step.error}</p>
                <Button
                  type="button"
                  variant="secondary"
                  loading={retryingId === step.id}
                  onClick={() => handleRetry(step)}
                >
                  Relancer cette étape
                </Button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
