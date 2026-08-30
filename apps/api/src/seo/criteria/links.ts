import type { Root } from 'mdast'
import { extractLinks } from '../../markdown'
import type { CriterionResult, SeoContext, SeoIssue } from '../types'

const INTERNAL_MAX = 5
const EXTERNAL_MAX = 5

/**
 * Note le maillage : au moins un lien interne et un lien externe. Poids
 * total 10 (5 + 5).
 *
 * Ne vérifie pas que le lien interne pointe vers un article existant : cette
 * vérification nécessite la base de données et appartient au service
 * (Task 9), pas à cet analyseur pur.
 */
export function evaluateLinks(ast: Root, _ctx: SeoContext): CriterionResult {
  const { internal, external } = extractLinks(ast)
  const issues: SeoIssue[] = []
  let earned = 0

  if (internal.length > 0) {
    earned += INTERNAL_MAX
  } else {
    issues.push({
      code: 'INTERNAL_LINK_MISSING',
      severity: 'WARNING',
      message: "L'article ne contient aucun lien interne.",
    })
  }

  if (external.length > 0) {
    earned += EXTERNAL_MAX
  } else {
    issues.push({
      code: 'EXTERNAL_LINK_MISSING',
      severity: 'WARNING',
      message: "L'article ne contient aucun lien externe.",
    })
  }

  return { code: 'LINKS', earned, max: INTERNAL_MAX + EXTERNAL_MAX, issues }
}
