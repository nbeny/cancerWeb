import type { Root } from 'mdast'
import { extractHeadings, countWords } from '../../markdown'
import { containsKeyword, countKeywordOccurrences, extractPlainText, firstWords } from '../text'
import type { CriterionResult, SeoContext, SeoIssue } from '../types'

const MAX = 15
const H1_MAX = 5
const INTRO_MAX = 5
const DENSITY_MAX = 5
const INTRO_WORD_COUNT = 100
const MIN_DENSITY_PERCENT = 0.5
const MAX_DENSITY_PERCENT = 2.5

/**
 * Note l'usage du mot-clé focus dans le contenu : présence dans le H1,
 * présence dans les 100 premiers mots, densité globale (0,5 %-2,5 %). Poids
 * total 15.
 *
 * `focusKeyword` est une donnée facultative de l'article : son absence ne
 * doit pas être pénalisée. Le critère entier est donc neutralisé
 * (`skipped: true`, `earned: 0`) plutôt que noté 0/15 — `analyzer.ts` exclut
 * alors ses 15 points du total possible.
 */
export function evaluateKeyword(ast: Root, ctx: SeoContext): CriterionResult {
  if (!ctx.focusKeyword) {
    return { code: 'KEYWORD', earned: 0, max: MAX, issues: [], skipped: true }
  }

  const keyword = ctx.focusKeyword
  const issues: SeoIssue[] = []
  let earned = 0

  const h1 = extractHeadings(ast).find((h) => h.depth === 1)
  if (h1 && containsKeyword(h1.text, keyword)) {
    earned += H1_MAX
  } else {
    issues.push({
      code: 'KEYWORD_MISSING_IN_H1',
      severity: 'WARNING',
      message: `Le mot-clé focus "${keyword}" n'apparaît pas dans le titre H1.`,
    })
  }

  const fullText = extractPlainText(ast)
  const intro = firstWords(fullText, INTRO_WORD_COUNT)
  if (containsKeyword(intro, keyword)) {
    earned += INTRO_MAX
  } else {
    issues.push({
      code: 'KEYWORD_MISSING_IN_INTRO',
      severity: 'WARNING',
      message: `Le mot-clé focus "${keyword}" n'apparaît pas dans les ${INTRO_WORD_COUNT} premiers mots.`,
    })
  }

  const totalWords = countWords(ast)
  const occurrences = countKeywordOccurrences(fullText, keyword)
  const density = totalWords > 0 ? (occurrences / totalWords) * 100 : 0
  if (density >= MIN_DENSITY_PERCENT && density <= MAX_DENSITY_PERCENT) {
    earned += DENSITY_MAX
  } else {
    issues.push({
      code: 'KEYWORD_DENSITY_OUT_OF_RANGE',
      severity: 'WARNING',
      message: `La densité du mot-clé focus est de ${density.toFixed(2)} % ; la cible est ${MIN_DENSITY_PERCENT}-${MAX_DENSITY_PERCENT} %.`,
    })
  }

  return { code: 'KEYWORD', earned, max: MAX, issues }
}
