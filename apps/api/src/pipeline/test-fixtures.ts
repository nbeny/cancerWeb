import { RunStatus } from '@prisma/client'
import type { Article, PipelineRun, PipelineStep } from '@prisma/client'
import { makeDomain, makeTopic } from '../ai/test-fixtures'
import type { PipelineRunWithSteps } from './step-handler'

/**
 * Constructeurs d'objets Prisma simulés pour les tests de `pipeline/` :
 * `PipelineRun`, `PipelineStep`, `Article`. Réutilise `makeDomain`/`makeTopic`
 * de `ai/test-fixtures.ts` plutôt que de les redéfinir, pour ne garder qu'un
 * seul endroit à mettre à jour si ces modèles évoluent.
 */
export function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    domainId: 'domain-1',
    topicId: 'topic-1',
    authorId: 'user-1',
    categoryId: null,
    title: "Comprendre l'immunothérapie moderne",
    slug: 'comprendre-immunotherapie-moderne',
    content: '',
    renderedHtml: null,
    excerpt: null,
    coverImageUrl: null,
    status: 'DRAFT',
    currentVersion: 1,
    wordCount: 0,
    latestSeoScore: null,
    scheduledAt: null,
    publishedAt: null,
    seoTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    focusKeyword: null,
    secondaryKeywords: [],
    robotsIndex: true,
    robotsFollow: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as Article
}

// `output`/`input` sont typés `Json?` côté Prisma : accepter `unknown` ici
// (plutôt que `Prisma.JsonValue`) évite d'imposer aux appelants de caster
// chaque `Outline`/rapport SEO simulé à la main dans chaque test.
type PipelineStepOverrides = Partial<Omit<PipelineStep, 'input' | 'output'>> & { input?: unknown; output?: unknown }

export function makePipelineStep(overrides: PipelineStepOverrides = {}): PipelineStep {
  return {
    id: 'step-1',
    runId: 'run-1',
    type: 'OUTLINE',
    order: 3,
    status: 'PENDING',
    attempt: 0,
    input: null,
    output: null,
    error: null,
    heartbeatAt: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  } as PipelineStep
}

export function makePipelineRun(overrides: Partial<PipelineRunWithSteps> = {}): PipelineRunWithSteps {
  const base: PipelineRun = {
    id: 'run-1',
    domainId: 'domain-1',
    topicId: 'topic-1',
    triggeredBy: 'user-1',
    automationId: null,
    articleId: null,
    status: RunStatus.RUNNING,
    currentStep: null,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as PipelineRun

  return {
    ...base,
    steps: [],
    domain: makeDomain(),
    article: null,
    topic: makeTopic(),
    ...overrides,
  }
}
