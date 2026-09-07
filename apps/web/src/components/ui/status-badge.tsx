import { cn } from '@/lib/cn'

export type Status =
  | 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'
  | 'IDEA' | 'SELECTED' | 'REJECTED' | 'CONVERTED'
  // `RunStatus`/`StepStatus`/`JobStatus` (Task 7, pipeline IA) : mêmes
  // valeurs texte que côté API (`@prisma/client`), réutilisées telles
  // quelles plutôt que remappées, pour que ce badge reste utilisable pour un
  // `PipelineRun`, un `PipelineStep` ou un `AIJob` sans composant dédié.
  | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SKIPPED' | 'WAITING_REVIEW'

const STYLES: Record<Status, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  PUBLISHED: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-slate-200 text-slate-500',
  IDEA: 'bg-violet-100 text-violet-800',
  SELECTED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  CONVERTED: 'bg-green-100 text-green-800',
  PENDING: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
  SKIPPED: 'bg-slate-100 text-slate-500',
  WAITING_REVIEW: 'bg-amber-100 text-amber-800',
}

const LABELS: Record<Status, string> = {
  DRAFT: 'Brouillon', REVIEW: 'En revue', APPROVED: 'Approuvé', SCHEDULED: 'Programmé',
  PUBLISHED: 'Publié', ARCHIVED: 'Archivé', IDEA: 'Idée', SELECTED: 'Sélectionné',
  REJECTED: 'Rejeté', CONVERTED: 'Converti',
  PENDING: 'En attente', RUNNING: 'En cours', COMPLETED: 'Terminé', FAILED: 'Échec',
  CANCELLED: 'Annulé', SKIPPED: 'Non exécutée', WAITING_REVIEW: 'En attente de revue',
}

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STYLES[status])}>
    {LABELS[status]}
  </span>
)
