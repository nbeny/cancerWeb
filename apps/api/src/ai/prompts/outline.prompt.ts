import type { Domain, Topic } from '@prisma/client'
import { buildDomainContextBlock } from './domain-context'

export const OUTLINE_PROMPT_VERSION = 'OUTLINE_V1'

/**
 * Demande un PLAN, jamais un article : la sortie doit être un Markdown de
 * titres uniquement (un H1, des H2/H3), chacun suivi d'une ligne d'intention.
 * Voir `../outline-validation.ts` pour la vérification qui suit — le prompt
 * est la première ligne de défense, pas la seule.
 *
 * Porte le marqueur `[[OUTLINE]]` attendu par `FakeAIProvider`
 * (`../providers/fake.provider.ts`) : sans lui, aucun test d'intégration du
 * pipeline ne peut sélectionner la bonne fixture.
 */
export function buildOutlinePrompt(domain: Domain, topic: Topic): string {
  const lines: (string | false | undefined)[] = [
    '[[OUTLINE]]',
    "Tu es rédacteur en chef. Prépare le PLAN d'un article, pas l'article lui-même.",
    '',
    buildDomainContextBlock(domain),
    '',
    "## Sujet de l'article",
    `Titre : ${topic.title}`,
    topic.description ? `Description : ${topic.description}` : undefined,
    topic.suggestedAngle ? `Angle suggéré : ${topic.suggestedAngle}` : undefined,
    topic.keywords.length > 0 ? `Mots-clés associés : ${topic.keywords.join(', ')}` : undefined,
    '',
    '## Consignes de sortie',
    "Réponds UNIQUEMENT avec un plan au format Markdown : un titre de niveau 1 (le titre de l'article), suivi de titres de niveau 2 et, si utile, de niveau 3 pour les sous-sections.",
    'Ajoute, juste après chaque titre, une seule ligne de texte qui résume son intention — une phrase, jamais un paragraphe rédigé.',
    "N'écris ni introduction, ni conclusion rédigée, ni article complet : uniquement la structure du plan.",
  ]

  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}

/**
 * Reconstruit le prompt initial en y ajoutant la raison précise du rejet
 * (`validateOutline`) et le plan refusé, pour que le modèle corrige
 * exactement le défaut signalé plutôt que de repartir de zéro. Utilisé par
 * `AITaskService.generateOutline` pour son unique relance.
 */
export function buildOutlineRetryPrompt(domain: Domain, topic: Topic, reason: string, rejectedMarkdown: string): string {
  return [
    buildOutlinePrompt(domain, topic),
    '',
    '## Le plan précédent a été rejeté',
    `Raison précise du rejet : ${reason}`,
    'Voici le plan rejeté, pour référence :',
    '```markdown',
    rejectedMarkdown,
    '```',
    'Corrige uniquement ce défaut et renvoie un plan Markdown complet respectant les mêmes consignes que ci-dessus.',
  ].join('\n')
}
