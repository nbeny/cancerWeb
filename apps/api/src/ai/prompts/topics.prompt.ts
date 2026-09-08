import type { Domain } from '@prisma/client'
import { buildDomainContextBlock } from './domain-context'

/**
 * V2 : la sortie attendue passe de titres Markdown en texte libre à un
 * tableau JSON à trois clés par sujet (`title`, `angle`, `rationale`), et le
 * prompt gagne la consigne anti-redite (`existingTitles`). `AIJob.promptVersion`
 * conserve cette valeur par job : c'est ce qui permet, en historique, de
 * distinguer les sujets qui pouvaient porter une justification de ceux
 * générés avant (V1), sans dépendre de la tolérance de `parseTopics`.
 */
export const TOPICS_PROMPT_VERSION = 'TOPICS_V2'

/**
 * Porte le marqueur `[[TOPICS]]` en première ligne, sur lequel `FakeAIProvider`
 * s'appuie pour choisir sa fixture : ce marqueur ne doit ni bouger de place
 * ni disparaître, sous peine de casser la CI et la suite d'intégration.
 *
 * Sortie attendue : un tableau JSON (voir `../parse-topics.ts`, qui essaie
 * cette forme en premier et conserve ses replis Markdown comme filet de
 * sécurité si le modèle désobéit).
 *
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
