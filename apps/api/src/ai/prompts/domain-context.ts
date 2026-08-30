import type { Domain } from '@prisma/client'

/**
 * Traductions des enums Prisma en français, pour un prompt lisible par un
 * modèle instruit en langage naturel plutôt qu'en constantes techniques
 * (`PROFESSIONAL`, `EXPERT`...). Une valeur non couverte retombe sur elle-même
 * (voir `buildDomainContextBlock`) plutôt que de lever : un enum étendu plus
 * tard ne doit pas casser la génération de prompt.
 */
const TONE_LABELS: Record<string, string> = {
  PROFESSIONAL: 'professionnel',
  EDUCATIONAL: 'pédagogique',
  JOURNALISTIC: 'journalistique',
  TECHNICAL: 'technique',
  ACCESSIBLE: 'accessible',
  PROVOCATIVE: 'engagé',
  NEUTRAL: 'neutre',
}

const EXPERTISE_LABELS: Record<string, string> = {
  BEGINNER: 'débutant',
  INTERMEDIATE: 'intermédiaire',
  EXPERT: 'expert',
}

/**
 * Bloc de contexte éditorial injecté dans les trois prompts (`topics`,
 * `outline`, `draft`) : c'est la SEULE fonction qui sait comment décrire un
 * domaine à un modèle. Un nouveau champ de contexte éditorial (Lot futur) se
 * modifie ici une fois, jamais dans les trois fichiers de prompt.
 *
 * Les sujets exclus sont présentés comme une contrainte absolue, jamais comme
 * une préférence : c'est `validateOutline` (voir `../outline-validation.ts`)
 * qui vérifie ensuite que la contrainte a été respectée, mais le prompt est
 * la première ligne de défense — la vérification a posteriori coûte une
 * relance complète (jusqu'à ~58s avec le provider CLI).
 */
export function buildDomainContextBlock(domain: Domain): string {
  const lines: string[] = ['## Contexte éditorial du domaine']

  lines.push(`- Langue de rédaction obligatoire : ${domain.language}`)
  lines.push(`- Ton éditorial : ${TONE_LABELS[domain.tone] ?? domain.tone}`)
  lines.push(`- Niveau d'expertise visé du lectorat : ${EXPERTISE_LABELS[domain.expertiseLevel] ?? domain.expertiseLevel}`)

  if (domain.targetAudience.length > 0) {
    lines.push(`- Audience visée : ${domain.targetAudience.join(', ')}`)
  }

  if (domain.keywords.length > 0) {
    lines.push(`- Mots-clés à privilégier quand c'est pertinent : ${domain.keywords.join(', ')}`)
  }

  if (domain.aiInstructions?.trim()) {
    lines.push(`- Instructions supplémentaires de l'équipe éditoriale : ${domain.aiInstructions.trim()}`)
  }

  if (domain.excludedTopics.length > 0) {
    lines.push('')
    lines.push(
      `CONTRAINTE ABSOLUE, NON NÉGOCIABLE : les sujets suivants sont interdits sur ce domaine. Ne les aborde JAMAIS, même indirectement ou en les citant en exemple à ne pas suivre : ${domain.excludedTopics.join(', ')}.`,
    )
  }

  return lines.join('\n')
}
