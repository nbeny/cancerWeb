import visit from 'unist-util-visit'
import type { Root } from 'mdast'

/**
 * Découpe un texte en "mots" au sens de la recherche de mot-clé : des suites
 * de lettres/chiffres Unicode (`\p{L}`/`\p{N}`, ce qui couvre les lettres
 * accentuées françaises). Tout le reste — espaces, ponctuation, apostrophe
 * (dactylographique `'` ou typographique `'`), trait d'union — est traité
 * comme séparateur.
 *
 * Conséquence assumée : une élision comme "l'article" devient deux mots
 * `["l", "article"]`, pour qu'une recherche du mot-clé "article" la retrouve
 * (cas cité dans le spec : un utilisateur écrira "l'IA" et cherchera "IA").
 * De même, un mot composé par trait d'union ("mot-clé") est éclaté en
 * `["mot", "clé"]` ; ce n'est pas un problème car le mot-clé cherché subit
 * exactement le même découpage avant comparaison.
 *
 * La comparaison est insensible à la casse (via `toLocaleLowerCase('fr-FR')`,
 * qui met correctement en minuscules les majuscules accentuées comme "É")
 * mais PAS aux accents eux-mêmes : "randonnée" et "randonnee" restent deux
 * mots distincts, ce sont deux mots français différents, pas une variante
 * graphique d'un même mot.
 */
function tokenize(text: string): string[] {
  const normalized = text.normalize('NFC').toLocaleLowerCase('fr-FR')
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * Compte les occurrences d'un mot-clé (mot unique ou expression de plusieurs
 * mots, ex. "cancer du sein") dans un texte, en cherchant sa séquence de
 * jetons (voir `tokenize`) comme sous-séquence contiguë de celle du texte.
 * Une correspondance sur des limites de mots complètes : "seo" ne compte
 * jamais comme trouvé dans "seomanager".
 */
export function countKeywordOccurrences(text: string, keyword: string): number {
  const textTokens = tokenize(text)
  const keywordTokens = tokenize(keyword)
  if (keywordTokens.length === 0 || textTokens.length < keywordTokens.length) {
    return 0
  }

  let count = 0
  for (let i = 0; i <= textTokens.length - keywordTokens.length; i++) {
    let matches = true
    for (let j = 0; j < keywordTokens.length; j++) {
      if (textTokens[i + j] !== keywordTokens[j]) {
        matches = false
        break
      }
    }
    if (matches) {
      count += 1
    }
  }
  return count
}

export function containsKeyword(text: string, keyword: string): boolean {
  return countKeywordOccurrences(text, keyword) > 0
}

/**
 * Reconstitue le texte brut du document à partir de ses nœuds texte, en les
 * joignant par un espace plutôt qu'en les concaténant directement : une
 * concaténation brute recollerait le dernier mot d'un paragraphe au premier
 * mot du suivant (même piège que documenté pour `countWords` dans
 * `markdown/extract.ts`, ex. "paragraphe.Second").
 */
export function extractPlainText(ast: Root): string {
  const parts: string[] = []
  visit(ast, (node: { type: string; value?: string }) => {
    if (node.type !== 'text' && node.type !== 'inlineCode') {
      return
    }
    const value = (node.value ?? '').trim()
    if (value) {
      parts.push(value)
    }
  })
  return parts.join(' ')
}

/**
 * Renvoie les `count` premiers mots d'un texte (découpage naïf sur les
 * espaces, suffisant ici puisqu'il ne sert qu'à délimiter une fenêtre de
 * lecture pour la recherche de mot-clé, pas à compter précisément les mots).
 */
export function firstWords(text: string, count: number): string {
  const words = text.split(/\s+/).filter(Boolean)
  return words.slice(0, count).join(' ')
}
