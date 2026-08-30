import type { Root } from 'mdast'
import { extractImages } from '../../markdown'
import type { CriterionResult, SeoContext } from '../types'

const MAX = 5

/**
 * Note l'accessibilité des images : toutes doivent avoir un texte
 * alternatif non vide. Un article sans image obtient le plein score (rien à
 * corriger). Poids total 5.
 */
export function evaluateImages(ast: Root, _ctx: SeoContext): CriterionResult {
  const images = extractImages(ast)
  const missing = images.filter((image) => !image.alt)

  if (missing.length === 0) {
    return { code: 'IMAGES', earned: MAX, max: MAX, issues: [] }
  }

  return {
    code: 'IMAGES',
    earned: 0,
    max: MAX,
    issues: [
      {
        code: 'IMAGE_ALT_MISSING',
        severity: 'WARNING',
        message: `${missing.length} image(s) sur ${images.length} n'ont pas de texte alternatif.`,
      },
    ],
  }
}
