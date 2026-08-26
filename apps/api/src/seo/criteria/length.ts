import type { Root } from 'mdast'
import { countWords } from '../../markdown'
import type { CriterionResult, SeoContext, SeoIssue } from '../types'

const MAX = 10
const MIN_WORDS = 300
const FULL_SCORE_WORDS = 600

/**
 * Note la longueur de l'article en mots : bloquant en dessous de 300 mots,
 * plein score à partir de 600. Entre les deux, le score croît linéairement
 * (300 mots -> 0/10, 600 mots -> 10/10) : le spec ne fixe qu'un plancher
 * bloquant et un plafond de plein score, pas de palier intermédiaire, une
 * interpolation linéaire est le choix le plus neutre entre les deux.
 */
export function evaluateLength(ast: Root, _ctx: SeoContext): CriterionResult {
  const words = countWords(ast)
  const issues: SeoIssue[] = []

  if (words < MIN_WORDS) {
    issues.push({
      code: 'CONTENT_TOO_SHORT',
      severity: 'BLOCKING',
      message: `L'article compte ${words} mots ; ${MIN_WORDS} sont requis au minimum.`,
    })
    return { code: 'LENGTH', earned: 0, max: MAX, issues }
  }

  const ratio = Math.min(1, (words - MIN_WORDS) / (FULL_SCORE_WORDS - MIN_WORDS))
  return { code: 'LENGTH', earned: ratio * MAX, max: MAX, issues }
}
