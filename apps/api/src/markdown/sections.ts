import toString from 'mdast-util-to-string'
import type { Root, Heading } from 'mdast'
import type { Node } from 'unist'

export interface Section {
  heading: string | null
  depth: number
  startLine: number
  endLine: number
}

function isHeading(node: Node): node is Heading {
  return node.type === 'heading'
}

/**
 * Découpe le document en sections délimitées par ses titres de premier
 * niveau de l'arbre (les titres ne sont jamais imbriqués dans un autre bloc
 * en Markdown/CommonMark, donc parcourir `ast.children` directement suffit,
 * sans avoir besoin d'une visite récursive de tout l'arbre).
 *
 * Tout contenu précédant le premier titre (ou la totalité du document s'il
 * n'en contient aucun) forme une section `heading: null, depth: 0`.
 *
 * Les numéros de ligne sont 1-indexés (voir `lineOf` dans `extract.ts`) et
 * délimitent la plage `[startLine, endLine]` couverte par chaque section :
 * `endLine` d'une section est la ligne précédant le titre suivant, ou la
 * dernière ligne du document pour la dernière section.
 *
 * `splitSections` n'a aucun consommateur dans ce lot : c'est le point
 * d'ancrage prévu pour les modifications ciblées par l'IA au Lot 2, qui
 * remplaceront une plage de lignes plutôt que de réécrire l'article entier.
 */
export function splitSections(ast: Root): Section[] {
  const children = ast.children
  if (children.length === 0) {
    return []
  }

  const firstLine = children[0]?.position?.start.line ?? 1
  const lastLine = ast.position?.end.line ?? children[children.length - 1]?.position?.end.line ?? firstLine

  const headingIndices = children.reduce<number[]>((acc, node, index) => {
    if (isHeading(node)) acc.push(index)
    return acc
  }, [])

  const sections: Section[] = []

  const firstHeadingLine =
    headingIndices.length > 0 ? children[headingIndices[0] as number]?.position?.start.line : undefined

  if (headingIndices.length === 0) {
    sections.push({ heading: null, depth: 0, startLine: firstLine, endLine: lastLine })
    return sections
  }

  if (firstHeadingLine !== undefined && firstHeadingLine > firstLine) {
    sections.push({ heading: null, depth: 0, startLine: firstLine, endLine: firstHeadingLine - 1 })
  }

  headingIndices.forEach((childIndex, i) => {
    const headingNode = children[childIndex] as Heading
    const startLine = headingNode.position?.start.line ?? firstLine
    const nextHeadingIndex = headingIndices[i + 1]
    const nextHeadingLine =
      nextHeadingIndex !== undefined ? children[nextHeadingIndex]?.position?.start.line : undefined
    const endLine = nextHeadingLine !== undefined ? nextHeadingLine - 1 : lastLine

    sections.push({ heading: toString(headingNode), depth: headingNode.depth, startLine, endLine })
  })

  return sections
}
