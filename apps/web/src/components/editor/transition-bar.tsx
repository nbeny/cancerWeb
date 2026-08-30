'use client'

import { useState } from 'react'
import type { ArticleStatus, ArticleStatusFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorCode, graphqlErrorMessage } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

interface Props {
  domainId: string
  articleId: string
  status: ArticleStatus
  onTransitioned: (patch: ArticleStatusFieldsFragment) => void
}

type ActionName =
  | 'submitForReview'
  | 'rejectArticle'
  | 'approveArticle'
  | 'publishArticle'
  | 'scheduleArticle'
  | 'archiveArticle'

interface TransitionDef {
  from: ArticleStatus
  action: ActionName
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  /** Ouvre un ConfirmDialog avant d'exécuter — pour les actions à effet notable ou irréversible. */
  confirm?: { title: string; description: string }
  needsDate?: boolean
}

// Reflète EXACTEMENT le diagramme de `apps/api/src/articles/transitions.ts`
// (TRANSITIONS) : une action absente d'ici pour le statut courant ne peut
// être vraie pour AUCUN rôle (voir sa jsdoc), donc ne mérite pas de bouton du
// tout — même désactivé. En revanche, une action présente ici mais refusée
// par le rôle de l'utilisateur reste affichée, désactivée, avec sa raison
// (voir le composant plus bas) : c'est la distinction que ce fichier doit
// respecter.
const TRANSITIONS: TransitionDef[] = [
  { from: 'DRAFT', action: 'submitForReview', label: 'Soumettre pour relecture' },
  {
    from: 'REVIEW',
    action: 'rejectArticle',
    label: 'Rejeter (renvoyer en brouillon)',
    variant: 'danger',
    confirm: {
      title: 'Rejeter cet article ?',
      description: 'L’article repasse en brouillon. L’auteur pourra le corriger et le soumettre à nouveau.',
    },
  },
  { from: 'REVIEW', action: 'approveArticle', label: 'Approuver' },
  {
    from: 'APPROVED',
    action: 'publishArticle',
    label: 'Publier',
    confirm: { title: 'Publier cet article ?', description: 'Il deviendra visible publiquement immédiatement.' },
  },
  { from: 'APPROVED', action: 'scheduleArticle', label: 'Programmer la publication', needsDate: true },
  {
    from: 'SCHEDULED',
    action: 'publishArticle',
    label: 'Publier maintenant',
    confirm: { title: 'Publier cet article maintenant ?', description: 'Il deviendra visible publiquement immédiatement, sans attendre la date programmée.' },
  },
  {
    from: 'PUBLISHED',
    action: 'archiveArticle',
    label: 'Archiver',
    variant: 'danger',
    confirm: { title: 'Archiver cet article ?', description: 'Il ne sera plus visible publiquement. Cette action reste réversible par un éditeur.' },
  },
]

// ---------------------------------------------------------------------------
// Rôle de l'utilisateur sur CE domaine : AUCUN champ du schéma GraphQL ne
// l'expose (`me` ne porte que `globalRole`, un rôle global ADMIN/USER sans
// rapport avec `DomainRole` par domaine ; il n'existe ni requête `domains`
// avec rôle, ni requête listant les membres). Voir le rapport de la Task
// 16-17 pour le signalement complet.
//
// Option retenue, la plus simple sans toucher `apps/api/` : tenter la
// mutation et exploiter la distinction que le backend fait déjà entre
// « transition inexistante » (jamais atteint ici : `TRANSITIONS` ci-dessus
// reflète le même diagramme, donc seules des transitions structurellement
// valides depuis le statut courant sont proposées) et « rôle insuffisant »
// (`ForbiddenException`, message "Rôle X requis..." — voir
// `apps/api/src/articles/transitions.ts`). Tant qu'aucune tentative n'a eu
// lieu, le bouton est actif : on ne peut pas deviner le rôle à l'avance.
// Après un échec, le bouton bascule en désactivé et affiche le message
// backend tel quel (déjà rédigé pour un humain) — jamais masqué.
// ---------------------------------------------------------------------------
export function TransitionBar({ domainId, articleId, status, onTransitioned }: Props) {
  const { showToast } = useToast()
  const [busyAction, setBusyAction] = useState<ActionName | null>(null)
  const [forbidden, setForbidden] = useState<Partial<Record<ActionName, string>>>({})
  const [confirming, setConfirming] = useState<TransitionDef | null>(null)
  const [scheduling, setScheduling] = useState<TransitionDef | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const available = TRANSITIONS.filter((t) => t.from === status)

  async function run(def: TransitionDef, extra?: { scheduledAt: string }) {
    setBusyAction(def.action)
    try {
      const { data } =
        def.action === 'scheduleArticle'
          ? await browserSdk.ScheduleArticle({ domainId, id: articleId, scheduledAt: new Date(extra!.scheduledAt).toISOString() })
          : def.action === 'submitForReview'
            ? await browserSdk.SubmitForReview({ domainId, id: articleId })
            : def.action === 'rejectArticle'
              ? await browserSdk.RejectArticle({ domainId, id: articleId })
              : def.action === 'approveArticle'
                ? await browserSdk.ApproveArticle({ domainId, id: articleId })
                : def.action === 'publishArticle'
                  ? await browserSdk.PublishArticle({ domainId, id: articleId })
                  : await browserSdk.ArchiveArticle({ domainId, id: articleId })

      const patch = Object.values(data)[0] as ArticleStatusFieldsFragment
      // Un statut a changé : l'ensemble des raisons de blocage mémorisées
      // portait sur l'ANCIEN statut, elle n'a plus de sens ici.
      setForbidden({})
      onTransitioned(patch)
      showToast({ title: 'Statut mis à jour', variant: 'success' })
    } catch (error) {
      const code = graphqlErrorCode(error)
      const message = graphqlErrorMessage(error)
      if (code === 'FORBIDDEN' && message) {
        setForbidden((current) => ({ ...current, [def.action]: message }))
      } else {
        showToast({ title: 'Action impossible', description: message, variant: 'error' })
      }
    } finally {
      setBusyAction(null)
      setConfirming(null)
    }
  }

  function handleClick(def: TransitionDef) {
    if (def.needsDate) {
      setScheduling(def)
      setScheduleError(null)
      return
    }
    if (def.confirm) {
      setConfirming(def)
      return
    }
    void run(def)
  }

  function confirmSchedule() {
    if (!scheduling || !scheduledAt) return
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      setScheduleError('La date de programmation doit être dans le futur.')
      return
    }
    void run(scheduling, { scheduledAt })
    setScheduling(null)
  }

  if (available.length === 0) {
    return <p className="text-sm text-slate-500">Aucune action de workflow disponible depuis ce statut.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {available.map((def) => {
          const reason = forbidden[def.action]
          return (
            <div key={def.action} className="flex flex-col gap-1">
              <Button
                variant={reason ? 'secondary' : (def.variant ?? 'primary')}
                disabled={Boolean(reason)}
                loading={busyAction === def.action}
                onClick={() => handleClick(def)}
              >
                {def.label}
              </Button>
              {reason && <p className="max-w-xs text-xs text-red-600">{reason}</p>}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming?.confirm?.title ?? ''}
        description={confirming?.confirm?.description}
        confirmLabel={confirming?.label}
        variant={confirming?.variant === 'danger' ? 'danger' : 'default'}
        loading={confirming !== null && busyAction === confirming.action}
        onConfirm={() => confirming && void run(confirming)}
      />

      <ConfirmDialog
        open={scheduling !== null}
        onOpenChange={(open) => !open && setScheduling(null)}
        title="Programmer la publication"
        description={
          <label className="flex flex-col gap-1 text-sm">
            <span>Date et heure de publication</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => {
                setScheduledAt(event.target.value)
                setScheduleError(null)
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            {scheduleError && <span className="text-xs text-red-600">{scheduleError}</span>}
          </label>
        }
        confirmLabel="Programmer"
        loading={scheduling !== null && busyAction === 'scheduleArticle'}
        onConfirm={confirmSchedule}
      />
    </div>
  )
}
