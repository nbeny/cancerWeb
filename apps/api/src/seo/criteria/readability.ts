import type { Root } from 'mdast'
import type { CriterionResult, SeoContext } from '../types'

const MAX = 10

/**
 * Note la lisibilité du contenu.
 *
 * Implémentation provisoire (Task 3) : la formule de lisibilité calibrée par
 * langue est livrée par la Task 4 (`../readability.ts`). En attendant, le
 * critère est neutralisé pour toutes les langues plutôt que d'appliquer une
 * formule non calibrée qui produirait un chiffre faux mais crédible — ce qui
 * serait pire qu'aucun chiffre.
 */
export function evaluateReadability(_ast: Root, _ctx: SeoContext): CriterionResult {
  return {
    code: 'READABILITY',
    earned: 0,
    max: MAX,
    skipped: true,
    issues: [
      {
        code: 'READABILITY_NOT_IMPLEMENTED',
        severity: 'INFO',
        message: "La lisibilité n'a pas encore été mesurée pour cet article.",
      },
    ],
  }
}
