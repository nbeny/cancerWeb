import type { Domain } from '@prisma/client'
import { buildDomainContextBlock } from './domain-context'

export const TOPICS_PROMPT_VERSION = 'TOPICS_V1'

/**
 * `existingTitles` porte TOUS les sujets déjà proposés sur le domaine, quel
 * que soit leur statut — les rejetés compris : un sujet écarté par l'équipe
 * éditoriale ne doit pas revenir à la génération suivante. C'est la première
 * des deux barrières anti-redite ; la seconde est le filtre à l'insertion
 * (`topics/topic-similarity.ts`), parce qu'un modèle peut désobéir.
 */
export function buildTopicsPrompt(domain: Domain, count: number, existingTitles: string[] = []): string {
  const lines: (string | false | undefined)[] = [
    '[[TOPICS]]',
    `Tu es rédacteur en chef. Propose ${count} idées d'articles nouvelles pour ce domaine éditorial.`,
    '',
    buildDomainContextBlock(domain),
    '',
    existingTitles.length > 0 && '## Sujets déjà proposés',
    existingTitles.length > 0 &&
      "Ces sujets ont DÉJÀ été proposés sur ce domaine. N'en propose aucun à nouveau, ni sous une formulation différente :",
    ...existingTitles.map((title) => `- ${title}`),
    existingTitles.length > 0 && '',
    '## Consignes de sortie',
    `Réponds par un tableau JSON de ${count} objets, et rien d'autre.`,
    'Chaque objet porte exactement ces clés :',
    '- `title` : le titre du sujet ;',
    "- `angle` : l'angle éditorial retenu, en une ligne ;",
    "- `rationale` : pourquoi CE sujet sert CE domaine en particulier — audience visée, mots-clés du domaine, manque à combler. Une à deux phrases.",
    "La justification doit être spécifique à ce domaine. Une phrase qui resterait vraie sur n'importe quel autre domaine ne convient pas.",
    "Ne rédige aucun article ni aucun plan détaillé : uniquement la liste des sujets proposés.",
  ]

  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}
