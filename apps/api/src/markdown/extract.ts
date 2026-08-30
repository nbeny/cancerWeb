import visit from 'unist-util-visit'
import toString from 'mdast-util-to-string'
import type { Root, Heading, Link, Image } from 'mdast'

export interface HeadingInfo {
  depth: number
  text: string
  line: number
}

export interface LinkInfo {
  href: string
  text: string
  line: number
}

export interface LinkExtraction {
  internal: LinkInfo[]
  external: LinkInfo[]
}

export interface ImageInfo {
  src: string
  alt: string | null
  line: number
}

/**
 * Numéro de ligne 1-indexé d'un nœud mdast, tel que fourni par `node.position`
 * (lui-même dérivé du positionnement du parseur `remark`). Un nœud sans
 * position (cas normalement impossible pour du contenu issu de `parse`)
 * retombe sur la ligne 1 plutôt que de lever.
 */
function lineOf(node: { position?: { start: { line: number } } }): number {
  return node.position?.start.line ?? 1
}

/**
 * Liste les titres (`#`..`######`) du document, dans l'ordre du texte.
 *
 * S'appuie sur l'AST : un `#` en début de ligne dans un bloc de code ou un
 * code inline n'est pas visité comme un `heading` par remark, donc il
 * n'apparaît jamais ici.
 */
export function extractHeadings(ast: Root): HeadingInfo[] {
  const headings: HeadingInfo[] = []
  visit(ast, 'heading', (node: Heading) => {
    headings.push({ depth: node.depth, text: toString(node), line: lineOf(node) })
  })
  return headings
}

/**
 * Classement interne / externe des liens (`[texte](href)`) du document.
 *
 * Convention retenue (à documenter pour quiconque relit ce fichier) :
 *   - **interne** : chemin relatif au site, c'est-à-dire ne commençant pas
 *     par un schéma d'URL (ex. `/articles/x`, `articles/x`).
 *   - **externe** : URL absolue avec schéma `http:` ou `https:`
 *     (ex. `https://ailleurs.fr`).
 *   - **ni l'un ni l'autre** : une pure ancre de page (`#section`). Elle ne
 *     pointe vers aucune ressource distincte (interne ou externe), seulement
 *     vers un endroit de la page courante ; le lien vers son propre site
 *     n'est donc pas comptabilisé s'il n'a pas de chemin. Un lien
 *     `/page#section` (chemin + ancre), lui, reste classé interne.
 *   - Les autres schémas (`mailto:`, `tel:`, `javascript:`, etc.) ne sont
 *     comptabilisés ni comme interne ni comme externe : ce ne sont pas des
 *     liens vers une page (articles internes ou site tiers) au sens SEO.
 */
export function extractLinks(ast: Root): LinkExtraction {
  const internal: LinkInfo[] = []
  const external: LinkInfo[] = []

  visit(ast, 'link', (node: Link) => {
    const href = node.url
    const info: LinkInfo = { href, text: toString(node), line: lineOf(node) }

    if (href.startsWith('#')) {
      return
    }

    if (/^https?:\/\//i.test(href)) {
      external.push(info)
      return
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      // Autre schéma explicite (mailto:, tel:, javascript:, ...) : ni interne ni externe.
      return
    }

    internal.push(info)
  })

  return { internal, external }
}

/**
 * Liste les images (`![alt](src)`) du document.
 *
 * Un texte alternatif absent ou uniquement composé d'espaces est normalisé
 * en `null` : `![ ](img.png)` est traité comme `![](img.png)`, pas comme un
 * alt "renseigné mais vide".
 */
export function extractImages(ast: Root): ImageInfo[] {
  const images: ImageInfo[] = []
  visit(ast, 'image', (node: Image) => {
    const alt = node.alt?.trim()
    images.push({ src: node.url, alt: alt ? alt : null, line: lineOf(node) })
  })
  return images
}

/**
 * Compte les mots du texte réellement rendu du document, pas les caractères
 * de balisage Markdown : `**gras**` compte pour un mot, pas trois.
 *
 * Compte les mots nœud texte par nœud texte (au lieu de concaténer tout le
 * texte du document puis de découper le résultat) : une concaténation brute
 * collerait le dernier mot d'un paragraphe au premier mot du paragraphe
 * suivant (ex. "paragraphe.Un"), faussant le compte.
 */
export function countWords(ast: Root): number {
  let total = 0
  visit(ast, (node: { type: string; value?: string }) => {
    if (node.type !== 'text' && node.type !== 'inlineCode') {
      return
    }
    const value = (node.value ?? '').trim()
    if (value) {
      total += value.split(/\s+/).length
    }
  })
  return total
}
