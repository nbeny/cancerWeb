import { diffLines } from 'diff'

export type DiffLineType = 'added' | 'removed' | 'unchanged'

export interface DiffLine {
  type: DiffLineType
  value: string
}

/**
 * Diff ligne à ligne entre deux versions de contenu (Task 17). Choix de
 * `diff` (jsdiff) plutôt qu'une implémentation maison : un diff correct
 * (algorithme de Myers, gestion des lignes vides et de fin de fichier sans
 * saut de ligne) est un problème résolu, testé par des milliers de projets —
 * le réécrire ici n'apporterait aucune valeur produit et serait une source
 * probable de bugs subtils (ex. décalage d'une ligne sur un cas limite).
 * `diff` est minuscule (zéro dépendance) et fournit ses propres types
 * TypeScript depuis la v6.
 *
 * Chaque bloc renvoyé par `diffLines` peut contenir plusieurs lignes
 * (`part.value` se termine par `\n` sauf pour la toute dernière ligne du
 * fichier) : on les éclate ici en lignes individuelles pour un rendu ligne
 * par ligne façon `git diff`.
 */
export function diffLinesByLine(before: string, after: string): DiffLine[] {
  // `ignoreNewlineAtEof` : sans cette option, la dernière ligne d'un contenu
  // SANS saut de ligne final (le cas courant : le contenu d'un article ne se
  // termine pas systématiquement par `\n`) est un token différent de la même
  // ligne AVEC un saut de ligne final dans l'autre version — jsdiff les
  // traite alors comme suppression+ajout de la ligne entière, jamais comme
  // "inchangée", ce qui aurait rendu quasi tout diff de fin de fichier
  // trompeur (vérifié : `diffLines('a\nb', 'a')` sans l'option supprime "a\nb"
  // en bloc et ajoute "a", au lieu de ne signaler que "b" supprimé).
  const parts = diffLines(before, after, { ignoreNewlineAtEof: true })
  const lines: DiffLine[] = []

  for (const part of parts) {
    const type: DiffLineType = part.added ? 'added' : part.removed ? 'removed' : 'unchanged'
    // `split('\n')` sur "a\nb\n" donne ["a", "b", ""] — le dernier élément
    // vide correspond à la fin de chaîne après le dernier `\n`, pas à une
    // ligne réelle : on l'écarte, sauf si le bloc entier était déjà vide.
    const values = part.value.split('\n')
    if (values[values.length - 1] === '') values.pop()
    for (const value of values) {
      lines.push({ type, value })
    }
  }

  return lines
}
