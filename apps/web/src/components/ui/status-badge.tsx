import { cn } from '@/lib/cn'

export type Status =
  | 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'
  | 'IDEA' | 'SELECTED' | 'REJECTED' | 'CONVERTED'

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
}

const LABELS: Record<Status, string> = {
  DRAFT: 'Brouillon', REVIEW: 'En revue', APPROVED: 'Approuvé', SCHEDULED: 'Programmé',
  PUBLISHED: 'Publié', ARCHIVED: 'Archivé', IDEA: 'Idée', SELECTED: 'Sélectionné',
  REJECTED: 'Rejeté', CONVERTED: 'Converti',
}

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STYLES[status])}>
    {LABELS[status]}
  </span>
)
