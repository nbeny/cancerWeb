'use client'

import { useEffect, useState } from 'react'
import type { PipelineRunFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'

const POLL_INTERVAL_MS = 2000
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

/**
 * Interroge `pipelineRun` toutes les 2 secondes TANT QUE le run est actif
 * (Task 7). Un polling qui continuerait indéfiniment sur un run terminé
 * chargerait le serveur pour rien sans que ça se voie jamais à l'écran —
 * c'est le défaut que ce hook est écrit pour éviter, vérifié par
 * `use-pipeline-run-polling.test.ts` (le mock `PipelineRun` n'est plus
 * appelé une fois `COMPLETED` reçu, même après avoir avancé le temps).
 *
 * Deux façons de s'arrêter :
 * 1. Le run initial (rendu côté serveur) est DÉJÀ terminal : l'effet ne
 *    programme même pas d'intervalle.
 * 2. Une réponse de poll devient terminale : `clearInterval` est appelé
 *    IMMÉDIATEMENT dans le callback (pas seulement au démontage), et l'effet
 *    ne se reprogramme pas au rendu suivant puisque `run.status` (dépendance)
 *    est désormais terminal.
 */
export function usePipelineRunPolling(domainId: string, initialRun: PipelineRunFieldsFragment): PipelineRunFieldsFragment {
  const [run, setRun] = useState(initialRun)

  useEffect(() => {
    if (isTerminal(run.status)) return

    let cancelled = false
    const interval = setInterval(() => {
      browserSdk.PipelineRun({ domainId, id: run.id }).then(({ data }) => {
        if (cancelled) return
        setRun(data.pipelineRun)
        if (isTerminal(data.pipelineRun.status)) clearInterval(interval)
      })
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [domainId, run.id, run.status])

  return run
}
