import type { Root } from 'mdast'
import toString from 'mdast-util-to-string'
import { readabilityScore } from '../readability'
import type { CriterionResult, SeoContext } from '../types'

const MAX = 10
/**
 * Les formules de Flesch / Kandel-Moles produisent un score à peu près sur
 * une échelle 0-100 (au-delà de ces bornes pour des textes extrêmes). On
 * le ramène proportionnellement sur les 10 points du critère plutôt que de
 * fixer un seuil de réussite arbitraire non demandé par le spec : le
 * barème SEO valorise ainsi un texte "plus facile" de façon continue,
 * sans palier de coupure inventé.
 */
const SCORE_SCALE_MAX = 100

/**
 * Note la lisibilité du contenu via `readabilityScore` (formule calibrée par
 * langue, voir `../readability.ts`).
 *
 * Une langue non couverte neutralise le critère (`skipped: true`) au lieu
 * d'appliquer une formule non adaptée : appliquer une formule anglaise à du
 * français produirait un chiffre faux mais crédible, ce qui oriente les
 * décisions éditoriales dans le vide — pire qu'aucun chiffre. `analyzer.ts`
 * exclut alors ces 10 points du total possible, pour que le score reste sur
 * 100.
 */
export function evaluateReadability(ast: Root, ctx: SeoContext): CriterionResult {
  const text = toString(ast)
  const { score, supported } = readabilityScore(text, ctx.language)

  if (!supported) {
    return {
      code: 'READABILITY',
      earned: 0,
      max: MAX,
      skipped: true,
      issues: [
        {
          code: 'READABILITY_LANGUAGE_UNSUPPORTED',
          severity: 'INFO',
          message: `La lisibilité n'a pas été mesurée : la langue "${ctx.language}" n'est pas encore prise en charge par l'analyseur.`,
        },
      ],
    }
  }

  const normalized = Math.min(SCORE_SCALE_MAX, Math.max(0, score))
  const earned = (normalized / SCORE_SCALE_MAX) * MAX

  return { code: 'READABILITY', earned, max: MAX, issues: [] }
}
