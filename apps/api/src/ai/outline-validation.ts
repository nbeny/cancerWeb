import type { Domain } from '@prisma/client'
import { extractHeadings, parse } from '../markdown'
import type { HeadingInfo } from '../markdown'
import type { Outline, OutlineValidation } from './ai-task.types'

/**
 * Borne haute d'un plan valide, en caractères du Markdown brut (avant parse).
 *
 * Justification du chiffre : un plan raisonnable pour un article long
 * (jusqu'à ~25 sections, H2 et H3 confondus) tient dans un titre par section
 * (~60 caractères) suivi d'une seule ligne d'intention (~150 caractères),
 * soit ~210 caractères par section. 25 × 210 ≈ 5 250, arrondi à 6 000 pour
 * laisser de la marge sans devenir permissif. Au-delà, ce n'est plus un plan
 * mais un brouillon rédigé — exactement ce que le prompt de `OUTLINE`
 * interdit (voir `prompts/outline.prompt.ts`) et que cette borne fait
 * respecter.
 */
export const MAX_OUTLINE_LENGTH = 6000

/**
 * Retire les diacritiques (accents) d'une chaîne : "Régimes" → "Regimes".
 * Nécessaire pour comparer un sujet exclu saisi avec ou sans accent à un
 * titre généré par le modèle, qui ne respecte pas forcément la même
 * orthographe.
 */
function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Découpe un texte en mots entiers, insensible à la casse et aux accents.
 * Une apostrophe (`l'IA`) n'est pas un caractère de mot : elle sépare "l" et
 * "IA" en deux tokens distincts, ce qui fait que "l'IA" matche le sujet
 * exclu "IA" (comparaison de mots entiers), sans jamais matcher une
 * sous-chaîne à l'intérieur d'un autre mot (ex. "diagnostic" ne contient pas
 * le mot "IA", même s'il contient la sous-chaîne "ia").
 */
function tokenize(text: string): string[] {
  return stripAccents(text).toLowerCase().match(/[a-z0-9]+/g) ?? []
}

/** Vrai si la séquence `needle` apparaît telle quelle (mots contigus, dans l'ordre) dans `haystack`. */
function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) {
      return true
    }
  }
  return false
}

/** Le premier sujet exclu du domaine abordé frontalement par ce titre, s'il y en a un. */
function findExcludedTopicMatch(headingText: string, excludedTopics: string[]): string | undefined {
  const headingTokens = tokenize(headingText)
  return excludedTopics.find((topic) => containsPhrase(headingTokens, tokenize(topic)))
}

/**
 * Vérifie qu'aucun saut de niveau n'existe dans la séquence des titres
 * (ex. H2 directement suivi d'un H4, sans H3 pour l'introduire). Renvoie la
 * première paire fautive, dans l'ordre du document.
 */
function findLevelSkip(headings: HeadingInfo[]): { previous: HeadingInfo; current: HeadingInfo } | undefined {
  for (let i = 1; i < headings.length; i++) {
    const previous = headings[i - 1] as HeadingInfo
    const current = headings[i] as HeadingInfo
    if (current.depth - previous.depth > 1) {
      return { previous, current }
    }
  }
  return undefined
}

/**
 * Valide un plan Markdown produit par le modèle avant de le considérer comme
 * l'`Outline` définitif de l'article. Chaque règle est vérifiée dans l'ordre
 * ci-dessous et la validation s'arrête à la première violation : le `reason`
 * renvoyé est directement réinjecté dans le prompt de relance
 * (`prompts/outline.prompt.ts#buildOutlineRetryPrompt`), donc formulé comme
 * une instruction correctrice, pas comme un constat technique.
 *
 * N'utilise aucune expression régulière sur le Markdown brut pour repérer les
 * titres : `parse` + `extractHeadings` (module `markdown/`) s'en chargent,
 * et savent déjà qu'un `#` dans un bloc de code n'est pas un titre.
 */
export function validateOutline(markdown: string, domain: Domain): OutlineValidation {
  const headings = extractHeadings(parse(markdown))

  const h1Headings = headings.filter((h) => h.depth === 1)
  if (h1Headings.length === 0) {
    return {
      valid: false,
      reason: "Le plan ne contient aucun titre de niveau 1 (H1). Ajoute un unique titre H1 : le titre de l'article.",
    }
  }
  if (h1Headings.length > 1) {
    return {
      valid: false,
      reason: `Le plan contient ${h1Headings.length} titres de niveau 1 (H1) ; il ne doit y en avoir qu'un seul, le titre de l'article. Transforme les autres en titres de niveau 2.`,
    }
  }

  const h2Headings = headings.filter((h) => h.depth === 2)
  if (h2Headings.length < 2) {
    return {
      valid: false,
      reason: `Le plan ne contient que ${h2Headings.length} titre(s) de niveau 2 (H2) ; il en faut au moins deux pour structurer l'article. Ajoute des sections H2.`,
    }
  }

  const emptyHeading = headings.find((h) => h.text.trim().length === 0)
  if (emptyHeading) {
    return {
      valid: false,
      reason: `Le plan contient un titre vide (ligne ${emptyHeading.line}). Chaque titre doit porter un texte.`,
    }
  }

  const levelSkip = findLevelSkip(headings)
  if (levelSkip) {
    return {
      valid: false,
      reason: `Le plan saute un niveau de titre entre "${levelSkip.previous.text}" (H${levelSkip.previous.depth}) et "${levelSkip.current.text}" (H${levelSkip.current.depth}). Ajoute un titre de niveau H${levelSkip.previous.depth + 1} entre les deux, ou remonte "${levelSkip.current.text}" au niveau H${levelSkip.previous.depth + 1}.`,
    }
  }

  const trimmedLength = markdown.trim().length
  if (trimmedLength > MAX_OUTLINE_LENGTH) {
    return {
      valid: false,
      reason: `Le plan est trop long (${trimmedLength} caractères, maximum ${MAX_OUTLINE_LENGTH}). C'est un plan, pas l'article : réduis chaque section à un titre suivi d'une seule ligne d'intention.`,
    }
  }

  if (domain.excludedTopics.length > 0) {
    for (const heading of headings) {
      const match = findExcludedTopicMatch(heading.text, domain.excludedTopics)
      if (match) {
        return {
          valid: false,
          reason: `Le titre "${heading.text}" aborde le sujet exclu "${match}", interdit sur ce domaine. Retire cette section ou reformule-la sans mentionner ce sujet.`,
        }
      }
    }
  }

  const outline: Outline = {
    h1: (h1Headings[0] as HeadingInfo).text,
    sections: headings.filter((h) => h.depth !== 1).map((h) => ({ title: h.text, depth: h.depth })),
  }

  return { valid: true, outline }
}
