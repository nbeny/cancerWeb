import type { Root } from 'mdast'
import type { CriterionResult, SeoContext, SeoIssue } from '../types'
import { containsKeyword } from '../text'

const LENGTH_MAX = 10
const KEYWORD_MAX = 5
const MIN_LENGTH = 120
const MAX_LENGTH = 158

/**
 * Note la meta description : présence (bloquante si absente), longueur en
 * caractères, présence du mot-clé focus. Poids total 15 (10 + 5).
 *
 * Comme pour TITLE, l'absence de `focusKeyword` retire son sous-critère du
 * barème plutôt que de le noter 0.
 */
export function evaluateMetaDescription(_ast: Root, ctx: SeoContext): CriterionResult {
  const keywordMax = ctx.focusKeyword ? KEYWORD_MAX : 0
  const max = LENGTH_MAX + keywordMax

  if (!ctx.metaDescription) {
    return {
      code: 'META_DESCRIPTION',
      earned: 0,
      max,
      issues: [
        {
          code: 'META_DESCRIPTION_MISSING',
          severity: 'BLOCKING',
          message: 'La meta description est absente : ajoutez-en une pour un score SEO complet.',
          field: 'metaDescription',
        },
      ],
      metrics: { metaDescriptionLength: 0 },
    }
  }

  const issues: SeoIssue[] = []
  let earned = 0
  const description = ctx.metaDescription

  if (description.length >= MIN_LENGTH && description.length <= MAX_LENGTH) {
    earned += LENGTH_MAX
  } else {
    issues.push({
      code: 'META_DESCRIPTION_LENGTH_OUT_OF_RANGE',
      severity: 'WARNING',
      message: `La meta description doit compter entre ${MIN_LENGTH} et ${MAX_LENGTH} caractères (actuellement ${description.length}).`,
      field: 'metaDescription',
    })
  }

  if (ctx.focusKeyword) {
    if (containsKeyword(description, ctx.focusKeyword)) {
      earned += KEYWORD_MAX
    } else {
      issues.push({
        code: 'META_DESCRIPTION_KEYWORD_MISSING',
        severity: 'WARNING',
        message: `Le mot-clé focus "${ctx.focusKeyword}" n'apparaît pas dans la meta description.`,
        field: 'metaDescription',
      })
    }
  }

  return { code: 'META_DESCRIPTION', earned, max, issues, metrics: { metaDescriptionLength: description.length } }
}
