import { ExpertiseLevel, Tone } from '@prisma/client'
import type { Domain, Topic } from '@prisma/client'

/**
 * Constructeurs d'objets Prisma simulés, partagés par toutes les specs du
 * module `ai/` (prompts, validation d'outline, `AITaskService`) et par
 * `pipeline/handlers/*.spec.ts`. Centralisés ici plutôt que dupliqués dans
 * chaque fichier de test : un champ ajouté au schéma (`Domain`, `Topic`) se
 * met à jour une fois, pas dans dix fichiers.
 */
export function makeDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: 'domain-1',
    name: 'Oncologie grand public',
    slug: 'oncologie',
    description: null,
    language: 'fr',
    country: null,
    tone: Tone.EDUCATIONAL,
    expertiseLevel: ExpertiseLevel.INTERMEDIATE,
    targetAudience: [],
    keywords: [],
    excludedTopics: [],
    aiInstructions: null,
    autoPublish: false,
    reviewOutline: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

export function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    domainId: 'domain-1',
    title: "Comprendre l'immunothérapie moderne",
    description: null,
    keywords: [],
    searchIntent: null,
    estimatedDifficulty: null,
    estimatedInterest: null,
    suggestedAngle: null,
    status: 'IDEA',
    generatedByJobId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as Topic
}
