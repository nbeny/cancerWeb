import { ArticleStatus, DomainRole } from '@prisma/client'
import { canTransition } from './transitions'

const STATUSES = Object.values(ArticleStatus)
const ROLES = Object.values(DomainRole)

// Reproduction indépendante du diagramme de la Task 7 : ne réutilise PAS la
// table interne de `transitions.ts`, pour que le test vérifie vraiment le
// comportement plutôt que de rejouer la même donnée que l'implémentation.
const DIAGRAM: Array<{ from: ArticleStatus; to: ArticleStatus; minRole: DomainRole }> = [
  { from: ArticleStatus.DRAFT, to: ArticleStatus.REVIEW, minRole: DomainRole.AUTHOR },
  { from: ArticleStatus.REVIEW, to: ArticleStatus.DRAFT, minRole: DomainRole.EDITOR }, // rejet
  { from: ArticleStatus.REVIEW, to: ArticleStatus.APPROVED, minRole: DomainRole.EDITOR },
  { from: ArticleStatus.APPROVED, to: ArticleStatus.PUBLISHED, minRole: DomainRole.EDITOR },
  { from: ArticleStatus.APPROVED, to: ArticleStatus.SCHEDULED, minRole: DomainRole.EDITOR },
  { from: ArticleStatus.SCHEDULED, to: ArticleStatus.PUBLISHED, minRole: DomainRole.EDITOR },
  { from: ArticleStatus.PUBLISHED, to: ArticleStatus.ARCHIVED, minRole: DomainRole.EDITOR },
]

const RANK: Record<DomainRole, number> = {
  [DomainRole.VIEWER]: 0,
  [DomainRole.AUTHOR]: 1,
  [DomainRole.EDITOR]: 2,
  [DomainRole.OWNER]: 3,
}

function expectedAllowed(from: ArticleStatus, to: ArticleStatus, role: DomainRole): boolean {
  const rule = DIAGRAM.find((d) => d.from === from && d.to === to)
  if (!rule) return false // transition absente du diagramme : jamais permise, quel que soit le rôle
  return RANK[role] >= RANK[rule.minRole]
}

describe('canTransition — matrice exhaustive (statuts × statuts × rôles)', () => {
  const cases: Array<[ArticleStatus, ArticleStatus, DomainRole]> = []
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      for (const role of ROLES) {
        cases.push([from, to, role])
      }
    }
  }

  it(`génère bien ${STATUSES.length}×${STATUSES.length}×${ROLES.length} = ${cases.length} cas`, () => {
    expect(STATUSES.length).toBe(6)
    expect(ROLES.length).toBe(4)
    expect(cases.length).toBe(144)
  })

  it.each(cases)('from=%s to=%s role=%s', (from, to, role) => {
    const expected = expectedAllowed(from, to, role)
    const result = canTransition(from, to, role)
    expect(result.allowed).toBe(expected)
    if (!expected) {
      expect((result as { reason: string }).reason).toEqual(expect.any(String))
      expect((result as { reason: string }).reason.length).toBeGreaterThan(0)
    }
  })
})

describe('canTransition — cas explicites', () => {
  it('AUTHOR : DRAFT → REVIEW autorisé', () => {
    expect(canTransition(ArticleStatus.DRAFT, ArticleStatus.REVIEW, DomainRole.AUTHOR)).toEqual({ allowed: true })
  })

  it('AUTHOR : REVIEW → APPROVED refusé', () => {
    const result = canTransition(ArticleStatus.REVIEW, ArticleStatus.APPROVED, DomainRole.AUTHOR)
    expect(result.allowed).toBe(false)
  })

  it('AUTHOR : APPROVED → PUBLISHED refusé', () => {
    const result = canTransition(ArticleStatus.APPROVED, ArticleStatus.PUBLISHED, DomainRole.AUTHOR)
    expect(result.allowed).toBe(false)
  })

  it('EDITOR : toutes les transitions du diagramme sont autorisées', () => {
    for (const rule of DIAGRAM) {
      expect(canTransition(rule.from, rule.to, DomainRole.EDITOR)).toEqual({ allowed: true })
    }
  })

  it.each([
    [ArticleStatus.DRAFT, ArticleStatus.PUBLISHED],
    [ArticleStatus.ARCHIVED, ArticleStatus.DRAFT],
    [ArticleStatus.DRAFT, ArticleStatus.APPROVED],
  ])('transition absente du diagramme (%s → %s) refusée pour tous les rôles, y compris OWNER', (from, to) => {
    for (const role of ROLES) {
      const result = canTransition(from, to, role)
      expect(result.allowed).toBe(false)
    }
  })

  it('VIEWER : aucune transition, quel que soit le couple from/to', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(canTransition(from, to, DomainRole.VIEWER).allowed).toBe(false)
      }
    }
  })

  it('DRAFT → DRAFT (transition vers soi-même) : refusée, absente du diagramme, pour tous les rôles', () => {
    // Décision : rester sur place n'est pas une transition d'état — ce n'est
    // l'affaire d'aucune mutation du workflow. L'absence de cette entrée dans
    // la table suffit à la refuser pour tous les rôles, y compris OWNER,
    // exactement comme n'importe quelle autre transition non répertoriée.
    for (const role of ROLES) {
      expect(canTransition(ArticleStatus.DRAFT, ArticleStatus.DRAFT, role).allowed).toBe(false)
    }
  })

  it('distingue "transition inexistante" de "rôle insuffisant" dans le message', () => {
    const inexistante = canTransition(ArticleStatus.DRAFT, ArticleStatus.PUBLISHED, DomainRole.OWNER)
    const roleInsuffisant = canTransition(ArticleStatus.DRAFT, ArticleStatus.REVIEW, DomainRole.VIEWER)

    expect(inexistante.allowed).toBe(false)
    expect(roleInsuffisant.allowed).toBe(false)
    if (inexistante.allowed || roleInsuffisant.allowed) throw new Error('unreachable')

    // Les deux raisons doivent être distinguables textuellement : l'UI (Task 17)
    // doit pouvoir afficher un message différent pour chaque cas.
    expect(inexistante.reason).not.toEqual(roleInsuffisant.reason)
    expect(inexistante.reason.toLowerCase()).toMatch(/inexistant|n'existe pas/)
    expect(roleInsuffisant.reason.toLowerCase()).toMatch(/rôle|role/)
  })
})
