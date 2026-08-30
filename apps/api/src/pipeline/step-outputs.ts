import { StepStatus } from '@prisma/client'
import type { PipelineStep, StepType } from '@prisma/client'

/**
 * Relit l'output persisté de la dernière tentative COMPLETED d'un type
 * d'étape donné, directement sur `PipelineStep.output`. C'est le mécanisme
 * qui permet à `DraftStepHandler` de lire l'`OUTLINE` déjà en base au lieu de
 * le régénérer (voir `handlers/draft.handler.ts`), et donc au rejeu d'une
 * étape de ne jamais refaire les précédentes.
 *
 * Plusieurs lignes du même type peuvent coexister (`@@unique([runId, type,
 * attempt])` dans `schema.prisma`) quand une étape a été rejouée
 * (`regenerateStep`, Task 5) : on retient la tentative avec le plus grand
 * `attempt`, jamais la première trouvée dans l'ordre du tableau.
 *
 * Échoue explicitement — jamais un `undefined` silencieux — si aucune
 * tentative de ce type n'est à la fois `COMPLETED` et pourvue d'un `output` :
 * une étape ne peut pas s'appuyer sur un résultat qui n'existe pas encore.
 */
export function findCompletedStepOutput<T>(steps: PipelineStep[], type: StepType, runId: string): T {
  const latest = steps
    .filter((step) => step.type === type && step.status === StepStatus.COMPLETED && step.output !== null && step.output !== undefined)
    .reduce<PipelineStep | undefined>((best, step) => (!best || step.attempt > best.attempt ? step : best), undefined)

  if (!latest) {
    throw new Error(
      `Étape ${type} : aucun résultat persisté et complété pour le run ${runId}. Cette étape doit être exécutée avec succès avant de pouvoir continuer.`,
    )
  }

  return latest.output as T
}
