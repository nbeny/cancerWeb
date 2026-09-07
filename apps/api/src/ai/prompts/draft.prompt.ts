import type { Domain, Topic } from '@prisma/client'
import type { Outline } from '../ai-task.types'
import { buildDomainContextBlock } from './domain-context'

export const DRAFT_PROMPT_VERSION = 'DRAFT_V1'

/** Reconstitue le Markdown de titres du plan validé, pour le renvoyer tel quel au modèle. */
function renderOutlineAsMarkdown(outline: Outline): string {
  const lines = [`# ${outline.h1}`, ...outline.sections.map((section) => `${'#'.repeat(section.depth)} ${section.title}`)]
  return lines.join('\n')
}

/**
 * Demande l'article complet à partir d'un plan **déjà validé** par
 * `validateOutline` — jamais reconstruit ni régénéré ici. Porte le marqueur
 * `[[DRAFT]]` attendu par `FakeAIProvider`.
 */
export function buildDraftPrompt(domain: Domain, topic: Topic, outline: Outline): string {
  const lines: (string | false | undefined)[] = [
    '[[DRAFT]]',
    "Tu es rédacteur. Rédige l'article complet à partir du plan déjà validé ci-dessous.",
    '',
    buildDomainContextBlock(domain),
    '',
    "## Sujet de l'article",
    `Titre : ${topic.title}`,
    topic.description ? `Description : ${topic.description}` : undefined,
    topic.suggestedAngle ? `Angle suggéré : ${topic.suggestedAngle}` : undefined,
    '',
    '## Plan validé à respecter strictement',
    '```markdown',
    renderOutlineAsMarkdown(outline),
    '```',
    '',
    '## Consignes de sortie',
    "Rédige l'article complet au format Markdown, en respectant exactement la structure de titres du plan ci-dessus : mêmes titres, même hiérarchie, même ordre.",
    "Développe chaque section avec un contenu substantiel, factuel et cohérent avec le ton et le niveau d'expertise demandés.",
    "Réponds uniquement avec le Markdown de l'article complet, sans commentaire ni note en dehors du texte de l'article.",
  ]

  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}
