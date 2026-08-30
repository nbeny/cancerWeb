'use client'

import type { SeoReportFieldsFragment } from '@cancerweb/graphql'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

interface Props {
  /** `null` = jamais analysé (à distinguer d'un score de 0, voir `article-editor.tsx`). */
  report: SeoReportFieldsFragment | null
  /** Un recalcul est en cours ou en attente (texte modifié depuis le dernier rapport). */
  stale: boolean
  analyzing: boolean
  analyzeError?: string
  onAnalyze: () => void
  /** Amène l'utilisateur au champ concerné par le problème (`issue.field`), quand connu. */
  onIssueClick: (field: string | null) => void
}

const SEVERITY_ORDER = ['BLOCKING', 'WARNING', 'INFO'] as const
const SEVERITY_LABELS: Record<(typeof SEVERITY_ORDER)[number], string> = {
  BLOCKING: 'Bloquant',
  WARNING: 'Avertissement',
  INFO: 'Information',
}
const SEVERITY_STYLES: Record<(typeof SEVERITY_ORDER)[number], string> = {
  BLOCKING: 'border-red-200 bg-red-50 text-red-900',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-900',
  INFO: 'border-slate-200 bg-slate-50 text-slate-700',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export function SeoPanel({ report, stale, analyzing, analyzeError, onAnalyze, onIssueClick }: Props) {
  // `cappedBy` est désormais exposé par le schéma GraphQL (champ calculé
  // côté serveur, voir `apps/api/src/seo/seo.resolver.ts`) : plus besoin de
  // reproduire ici la règle de plafonnement à partir des `issues`.
  const cappedBy = report?.cappedBy ?? []
  const isCapped = cappedBy.length > 0

  const grouped = SEVERITY_ORDER.map((severity) => ({
    severity,
    issues: report?.issues.filter((issue) => issue.severity === severity) ?? [],
  })).filter((group) => group.issues.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Score SEO</h2>
        <Button variant="secondary" onClick={onAnalyze} loading={analyzing} className="px-2 py-1 text-xs">
          {report ? 'Réanalyser' : 'Analyser'}
        </Button>
      </div>

      {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}

      {report === null ? (
        <p className="text-sm italic text-slate-400">Pas encore analysé.</p>
      ) : (
        <div className={cn('flex flex-col gap-1', stale && 'opacity-50')}>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-4xl font-bold', scoreColor(report.score))}>{report.score}</span>
            <span className="text-sm text-slate-500">/ 100</span>
            {stale && (
              <span className="text-xs italic text-slate-400" role="status">
                Recalcul en cours…
              </span>
            )}
          </div>
          {isCapped && (
            <p className="text-sm font-medium text-red-700">
              Score plafonné à {report.score} — {cappedBy.length} faute{cappedBy.length > 1 ? 's' : ''} bloquante
              {cappedBy.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {grouped.length > 0 && (
        <div className={cn('flex flex-col gap-3', stale && 'opacity-50')}>
          {grouped.map(({ severity, issues }) => (
            <div key={severity} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {SEVERITY_LABELS[severity]} ({issues.length})
              </h3>
              {issues.map((issue, index) => (
                <button
                  key={`${issue.code}-${index}`}
                  type="button"
                  onClick={() => onIssueClick(issue.field ?? null)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-xs',
                    SEVERITY_STYLES[severity],
                    issue.field && 'cursor-pointer hover:brightness-95',
                  )}
                  disabled={!issue.field}
                >
                  {issue.message}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
