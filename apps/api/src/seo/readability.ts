export interface ReadabilityResult {
  score: number
  supported: boolean
}

/**
 * Langues pour lesquelles une formule de lisibilité calibrée est disponible.
 * Toute autre langue renvoie `supported: false` plutôt que d'appliquer une
 * formule non adaptée : un score de lisibilité anglais appliqué à du
 * français (ou l'inverse) produirait un chiffre faux mais crédible, ce qui
 * oriente les décisions éditoriales dans le vide — pire qu'aucun chiffre.
 */
const SUPPORTED_LANGUAGES = new Set(['fr', 'en'])

const VOWELS_FR = 'aeiouyàâäéèêëïîôöùûüœæ'
const VOWELS_EN = 'aeiouy'

/**
 * Compte approximatif du nombre de syllabes d'un mot, par comptage des
 * groupes de voyelles consécutives (une diphtongue/triphtongue compte pour
 * une seule syllabe : "oiseau" est ainsi compté 1 alors qu'il s'agit en
 * réalité de deux syllabes prononcées, "oi-seau" ; l'inverse — une
 * sous-évaluation — peut aussi se produire selon les mots).
 *
 * Ajustement partagé par les deux langues : un "e" final non précédé de
 * "l" ne compte pas comme une syllabe supplémentaire s'il en reste au moins
 * une sans lui (le "e" muet français de "table", ou l'anglais de "like").
 * L'exception sur "le" évite de supprimer la syllabe portée par "-ble",
 * "-ple" etc. ("table" reste comptée "ta-ble", 2 syllabes).
 *
 * Limites connues et assumées (documentées plutôt que cachées) : les sigles
 * ("ADN", "HTML") et les nombres écrits en chiffres ne suivent pas la
 * phonétique d'un mot ordinaire et seront comptés de façon approximative
 * (typiquement un groupe de voyelles = une syllabe, ce qui sous-évalue un
 * sigle prononcé lettre à lettre) ; les mots composés joints par apostrophe
 * ou trait d'union ne posent pas de problème ici car ils sont déjà séparés
 * en mots distincts avant cet appel.
 */
function countSyllablesInWord(word: string, language: string): number {
  const lower = word.toLowerCase()
  const vowels = language === 'fr' ? VOWELS_FR : VOWELS_EN
  const groups = lower.match(new RegExp(`[${vowels}]+`, 'g'))
  let count = groups ? groups.length : 0
  if (count === 0) {
    count = 1
  }
  if (count > 1 && lower.endsWith('e') && !lower.endsWith('le')) {
    count -= 1
  }
  return count
}

function splitWords(text: string): string[] {
  return text.match(/\p{L}+/gu) ?? []
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Score de lisibilité calibré par langue.
 *
 * - `en` : formule de Flesch Reading Ease standard.
 * - `fr` : variante Kandel-Moles, l'adaptation au français la plus citée de
 *   la formule de Flesch — mêmes variables (longueur moyenne de phrase,
 *   nombre moyen de syllabes par mot), constantes recalibrées pour la
 *   phonétique française.
 *
 * Dans les deux cas, un score plus élevé signifie un texte plus facile à
 * lire. Toute langue hors `fr`/`en` renvoie `{ supported: false }` : c'est
 * au critère SEO appelant (`criteria/readability.ts`) de neutraliser la
 * catégorie dans ce cas, jamais d'inventer un chiffre.
 */
export function readabilityScore(text: string, language: string): ReadabilityResult {
  if (!SUPPORTED_LANGUAGES.has(language)) {
    return { score: 0, supported: false }
  }

  const words = splitWords(text)
  const sentences = splitSentences(text)

  if (words.length === 0 || sentences.length === 0) {
    return { score: 0, supported: true }
  }

  const syllables = words.reduce((sum, word) => sum + countSyllablesInWord(word, language), 0)
  const averageSentenceLength = words.length / sentences.length
  const averageSyllablesPerWord = syllables / words.length

  const score =
    language === 'fr'
      ? 207 - 1.015 * averageSentenceLength - 73.6 * averageSyllablesPerWord
      : 206.835 - 1.015 * averageSentenceLength - 84.6 * averageSyllablesPerWord

  return { score, supported: true }
}
