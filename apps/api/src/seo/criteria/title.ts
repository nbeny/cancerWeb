import type { Root } from 'mdast'
import type { CriterionResult, SeoContext, SeoIssue } from '../types'
import { containsKeyword } from '../text'

const LENGTH_MAX = 12
const KEYWORD_MAX = 8
const MIN_LENGTH = 30
const MAX_LENGTH = 60

/**
 * Note le titre SEO (`seoTitle`) : longueur en caractères et présence du
 * mot-clé focus. Poids total 20 (12 + 8).
 *
 * Quand `focusKeyword` est absent, le sous-critère "mot-clé présent" est
 * retiré du barème de CE critère (`max` ramené à 12/20) plutôt que noté 0 :
 * on ne pénalise pas l'absence d'une donnée facultative (voir `analyzer.ts`
 * pour la même logique appliquée au critère KEYWORD dans son ensemble).
 */
export function evaluateTitle(_ast: Root, ctx: SeoContext): CriterionResult {
  const issues: SeoIssue[] = []
  const title = ctx.seoTitle ?? ''
  let earned = 0
  let max = LENGTH_MAX

  if (title.length >= MIN_LENGTH && title.length <= MAX_LENGTH) {
    earned += LENGTH_MAX
  } else {
    issues.push({
      code: 'TITLE_LENGTH_OUT_OF_RANGE',
      severity: 'WARNING',
      message: `Le titre SEO doit compter entre ${MIN_LENGTH} et ${MAX_LENGTH} caractères (actuellement ${title.length}).`,
      field: 'seoTitle',
    })
  }

  if (ctx.focusKeyword) {
    max += KEYWORD_MAX
    if (containsKeyword(title, ctx.focusKeyword)) {
      earned += KEYWORD_MAX
    } else {
      issues.push({
        code: 'TITLE_KEYWORD_MISSING',
        severity: 'WARNING',
        message: `Le mot-clé focus "${ctx.focusKeyword}" n'apparaît pas dans le titre SEO.`,
        field: 'seoTitle',
      })
    }
  }

  return { code: 'TITLE', earned, max, issues, metrics: { seoTitleLength: title.length } }
}
