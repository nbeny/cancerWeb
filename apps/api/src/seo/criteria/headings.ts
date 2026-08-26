import type { Root } from 'mdast'
import { extractHeadings } from '../../markdown'
import type { CriterionResult, SeoContext, SeoIssue } from '../types'

const H1_MAX = 10
const LEVEL_SKIP_MAX = 5

/**
 * Note la structure des titres : exactement un H1 (bloquant si 0 ou plus
 * d'un), et l'absence de saut de niveau (ex. H2 -> H4 sans H3). Poids total
 * 15 (10 + 5).
 */
export function evaluateHeadings(ast: Root, _ctx: SeoContext): CriterionResult {
  const headings = extractHeadings(ast)
  const issues: SeoIssue[] = []
  let earned = 0

  const h1Count = headings.filter((h) => h.depth === 1).length
  if (h1Count === 1) {
    earned += H1_MAX
  } else if (h1Count === 0) {
    issues.push({
      code: 'H1_MISSING',
      severity: 'BLOCKING',
      message: "L'article ne contient aucun titre H1.",
    })
  } else {
    issues.push({
      code: 'H1_MULTIPLE',
      severity: 'BLOCKING',
      message: `L'article contient ${h1Count} titres H1 ; il ne doit y en avoir qu'un seul.`,
    })
  }

  let hasSkip = false
  for (let i = 1; i < headings.length; i++) {
    const previousDepth = headings[i - 1]?.depth
    const currentDepth = headings[i]?.depth
    if (previousDepth !== undefined && currentDepth !== undefined && currentDepth - previousDepth > 1) {
      hasSkip = true
      break
    }
  }

  if (!hasSkip) {
    earned += LEVEL_SKIP_MAX
  } else {
    issues.push({
      code: 'HEADING_LEVEL_SKIPPED',
      severity: 'WARNING',
      message: 'Un niveau de titre est sauté dans la hiérarchie (ex. H2 vers H4 sans H3).',
    })
  }

  return { code: 'HEADINGS', earned, max: H1_MAX + LEVEL_SKIP_MAX, issues }
}
