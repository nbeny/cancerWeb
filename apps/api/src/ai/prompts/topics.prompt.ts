import type { Domain } from '@prisma/client'
import { buildDomainContextBlock } from './domain-context'

export const TOPICS_PROMPT_VERSION = 'TOPICS_V1'

/**
 * Demande une liste de sujets d'articles nouveaux. Sortie attendue : une
 * liste Markdown (titres de niveau 2, ou liste à puces), voir
 * `../parse-topics.ts` pour la tolérance à la forme réellement acceptée en
 * sortie. Porte le marqueur `[[TOPICS]]` attendu par `FakeAIProvider`.
 */
export function buildTopicsPrompt(domain: Domain, count: number): string {
  const lines: (string | false | undefined)[] = [
    '[[TOPICS]]',
    `Tu es rédacteur en chef. Propose ${count} idées d'articles nouvelles pour ce domaine éditorial.`,
    '',
    buildDomainContextBlock(domain),
    '',
    '## Consignes de sortie',
    `Propose exactement ${count} sujets, sous la forme d'une liste Markdown : soit des titres de niveau 2 ("## Titre du sujet"), soit une liste à puces ("- Titre du sujet"), au choix.`,
    "Pour chaque sujet, ajoute si possible une courte ligne décrivant l'angle éditorial retenu.",
    "Ne rédige aucun article ni aucun plan détaillé : uniquement la liste des sujets proposés.",
  ]

  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}
