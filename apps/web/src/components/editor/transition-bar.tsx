'use client'

import { useState } from 'react'
import type { ArticleStatus, ArticleStatusFieldsFragment, DomainRole } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorCode, graphqlErrorMessage } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

interface Props {
  domainId: string
  articleId: string
  status: ArticleStatus
  /** Rôle de l'utilisateur COURANT sur le domaine de l'article (`Article.domain.myRole`, correctif 2). */
  myRole: DomainRole
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
  /** Rôle minimum requis — voir `apps/api/src/articles/transitions.ts` (TRANSITIONS). */
  minRole: DomainRole
  variant?: 'primary' | 'secondary' | 'danger'
  /** Ouvre un ConfirmDialog avant d'exécuter — pour les actions à effet notable ou irréversible. */
  confirm?: { title: string; description: string }
  needsDate?: boolean
}

// Hiérarchie des rôles de domaine — DUPLIQUÉE depuis
// `apps/api/src/common/guards/domain-role.guard.ts` (`RANK`), qui la
// duplique lui-même depuis `apps/api/src/articles/transitions.ts` avec la
// même justification : un tableau de 4 entrées, trivialement vérifiable à
// l'œil à chaque revue, ne justifie pas de faire dépendre `apps/web` de
// `apps/api` (aucun package partagé n'exporte aujourd'hui la logique
// métier de l'API — seul le SDK GraphQL généré et `@cancerweb/validation`
// le sont). Le motif est donc COHÉRENT avec l'existant, pas une exception.
const RANK: Record<DomainRole, number> = { VIEWER: 0, AUTHOR: 1, EDITOR: 2, OWNER: 3 }

// Reflète EXACTEMENT le diagramme de `apps/api/src/articles/transitions.ts`
// (TRANSITIONS), `minRole` inclus : une action absente d'ici pour le statut
// courant ne peut être vraie pour AUCUN rôle (voir sa jsdoc), donc ne
// mérite pas de bouton du tout — même désactivé. En revanche, une action
// présente ici mais refusée par le rôle de l'utilisateur reste affichée,
// désactivée, avec sa raison (voir le composant plus bas) : c'est la
// distinction que ce fichier doit respecter.
const TRANSITIONS: TransitionDef[] = [
  { from: 'DRAFT', action: 'submitForReview', label: 'Soumettre pour relecture', minRole: 'AUTHOR' },
  {
    from: 'REVIEW',
    action: 'rejectArticle',
    label: 'Rejeter (renvoyer en brouillon)',
    minRole: 'EDITOR',
    variant: 'danger',
    confirm: {
      title: 'Rejeter cet article ?',
      description: 'L’article repasse en brouillon. L’auteur pourra le corriger et le soumettre à nouveau.',
    },
  },
  { from: 'REVIEW', action: 'approveArticle', label: 'Approuver', minRole: 'EDITOR' },
  {
    from: 'APPROVED',
    action: 'publishArticle',
    label: 'Publier',
    minRole: 'EDITOR',
    confirm: { title: 'Publier cet article ?', description: 'Il deviendra visible publiquement immédiatement.' },
  },
  { from: 'APPROVED', action: 'scheduleArticle', label: 'Programmer la publication', minRole: 'EDITOR', needsDate: true },
  {
    from: 'SCHEDULED',
    action: 'publishArticle',
    label: 'Publier maintenant',
    minRole: 'EDITOR',
    confirm: { title: 'Publier cet article maintenant ?', description: 'Il deviendra visible publiquement immédiatement, sans attendre la date programmée.' },
  },
  {
    from: 'PUBLISHED',
    action: 'archiveArticle',
    label: 'Archiver',
    minRole: 'EDITOR',
    variant: 'danger',
    confirm: { title: 'Archiver cet article ?', description: 'Il ne sera plus visible publiquement. Cette action reste réversible par un éditeur.' },
  },
]

// ---------------------------------------------------------------------------
// Rôle de l'utilisateur sur CE domaine : exposé depuis la Task 18 (correctif
// 2) par `Article.domain.myRole`, connu AVANT tout clic — voir le rapport
// de la Task 16-17 pour l'ancien signalement de ce trou, désormais comblé.
// Chaque bouton est donc désactivé DÈS LE RENDU si `myRole` n'atteint pas
// `minRole`, avec sa raison en infobulle (`title`) et sous le bouton — plus
// besoin d'un aller-retour réseau pour le découvrir. La gestion de l'échec
// `FORBIDDEN` après clic reste en place en défense en profondeur (ex. rôle
// rétrogradé par un autre utilisateur entre le rendu et le clic), mais n'est
// plus le mécanisme PRINCIPAL de découverte du droit.
// ---------------------------------------------------------------------------
function roleReason(def: TransitionDef, myRole: DomainRole): string | undefined {
  if (RANK[myRole] >= RANK[def.minRole]) return undefined
  return `Rôle ${def.minRole} requis pour cette action (rôle actuel : ${myRole})`
}

export function TransitionBar({ domainId, articleId, status, myRole, onTransitioned }: Props) {
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
          // Le rôle (connu avant tout clic) l'emporte comme raison affichée ;
          // `forbidden[def.action]` ne peut de toute façon plus se produire
          // pour une raison de rôle (voir `run`, qui ne le peuple qu'après un
          // clic — désormais impossible sur un bouton déjà désactivé par
          // `roleReason`), seulement pour un autre motif de refus éventuel.
          const reason = roleReason(def, myRole) ?? forbidden[def.action]
          return (
            <div key={def.action} className="flex flex-col gap-1">
              <Button
                variant={reason ? 'secondary' : (def.variant ?? 'primary')}
                disabled={Boolean(reason)}
                loading={busyAction === def.action}
                onClick={() => handleClick(def)}
                title={reason}
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
