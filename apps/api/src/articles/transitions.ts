import { ArticleStatus, DomainRole } from '@prisma/client'

/**
 * Fonction pure, sans base de données ni dépendance NestJS : elle rend la
 * matrice de transitions testable exhaustivement (36 couples de statuts ×
 * 4 rôles = 144 cas) en quelques millisecondes.
 */
export type TransitionCheck = { allowed: true } | { allowed: false; reason: string }

/**
 * Hiérarchie des rôles de domaine. Dupliquée depuis
 * `common/guards/domain-role.guard.ts` plutôt qu'importée : ce module ne doit
 * dépendre d'aucun symbole NestJS pour rester pur et trivialement testable.
 */
const RANK: Record<DomainRole, number> = {
  [DomainRole.VIEWER]: 0,
  [DomainRole.AUTHOR]: 1,
  [DomainRole.EDITOR]: 2,
  [DomainRole.OWNER]: 3,
}

export interface TransitionRule {
  from: ArticleStatus
  to: ArticleStatus
  minRole: DomainRole
  /** Libellé de la transition, utilisé comme `changeNote` de la version créée (Task 8). */
  action: string
}

/**
 * Table de données, pas une cascade de `if` : une entrée absente ici est une
 * transition inexistante pour TOUT rôle, y compris OWNER. Un OWNER a tous les
 * droits sur les transitions qui existent, pas le droit d'en inventer.
 *
 *   DRAFT ──submit──▶ REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED
 *     ▲                  │                    │                     │
 *     └─── reject ───────┘                    └──schedule──▶ SCHEDULED
 *                                                                  │
 *   ARCHIVED ◀───────────────── archive ────────────────────────────┘
 */
export const TRANSITIONS: TransitionRule[] = [
  { from: ArticleStatus.DRAFT, to: ArticleStatus.REVIEW, minRole: DomainRole.AUTHOR, action: 'submit' },
  { from: ArticleStatus.REVIEW, to: ArticleStatus.DRAFT, minRole: DomainRole.EDITOR, action: 'reject' },
  { from: ArticleStatus.REVIEW, to: ArticleStatus.APPROVED, minRole: DomainRole.EDITOR, action: 'approve' },
  { from: ArticleStatus.APPROVED, to: ArticleStatus.PUBLISHED, minRole: DomainRole.EDITOR, action: 'publish' },
  { from: ArticleStatus.APPROVED, to: ArticleStatus.SCHEDULED, minRole: DomainRole.EDITOR, action: 'schedule' },
  { from: ArticleStatus.SCHEDULED, to: ArticleStatus.PUBLISHED, minRole: DomainRole.EDITOR, action: 'publish' },
  { from: ArticleStatus.PUBLISHED, to: ArticleStatus.ARCHIVED, minRole: DomainRole.EDITOR, action: 'archive' },
]

/**
 * `DRAFT → DRAFT` (et plus généralement `X → X`) n'apparaît volontairement
 * dans aucune entrée : rester sur le même statut n'est pas une transition du
 * workflow, donc elle est refusée pour tous les rôles comme n'importe quelle
 * autre transition absente du diagramme.
 */
export function canTransition(from: ArticleStatus, to: ArticleStatus, role: DomainRole): TransitionCheck {
  const rule = TRANSITIONS.find((t) => t.from === from && t.to === to)
  if (!rule) {
    // « Cette transition n'existe pas » : aucun rôle ne peut y remédier.
    return { allowed: false, reason: `La transition ${from} → ${to} n'existe pas` }
  }
  if (RANK[role] < RANK[rule.minRole]) {
    // « Ton rôle ne l'autorise pas » : la transition existe, un rôle plus élevé suffirait.
    return { allowed: false, reason: `Rôle ${rule.minRole} requis pour la transition ${from} → ${to} (rôle actuel : ${role})` }
  }
  return { allowed: true }
}

/** Le libellé d'action de la transition `from → to`, s'il en existe une. Utilisé pour horodater les versions (Task 8). */
export function transitionAction(from: ArticleStatus, to: ArticleStatus): string | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to)?.action
}
