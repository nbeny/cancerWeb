import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import unified from 'unified'
import type { Root } from 'mdast'

/**
 * Analyse une chaîne Markdown (GFM) en un arbre syntaxique abstrait (AST) mdast.
 *
 * Toute la logique du module `markdown/` (rendu, extraction de titres/liens/
 * images, découpage en sections...) doit s'appuyer sur cet AST, jamais sur des
 * expressions régulières appliquées au texte brut : un `#` en début de ligne
 * dans un bloc de code n'est pas un titre, un `[texte](url)` dans un bloc
 * littéral n'est pas un lien. Seul un vrai parseur fait cette distinction.
 *
 * Fonction pure : pas d'accès disque, réseau ou base de données.
 */
export function parse(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm)
  return processor.parse(markdown) as unknown as Root
}
