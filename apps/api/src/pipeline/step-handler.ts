import type { Article, Domain, PipelineRun, PipelineStep, StepType, Topic } from '@prisma/client'

/**
 * `PipelineRun` chargé avec tout le contexte dont un `StepHandler` peut avoir
 * besoin pour reconstruire l'entrée d'une étape sans base de données. `domain`
 * et `article` sont de vraies relations Prisma (`@relation` sur `PipelineRun`
 * dans `schema.prisma`) ; `topic`, lui, ne l'est pas — `PipelineRun.topicId`
 * n'a pas de champ de relation associé dans le schéma, volontairement non
 * modifié pour ce lot. C'est donc l'orchestrateur (Task 5) qui va chercher le
 * `Topic` par son id et l'attache manuellement avant d'appeler un handler.
 *
 * Ce type n'est un type Prisma que par composition : personne ne l'obtient
 * d'un `prisma.pipelineRun.findUnique(...)` en un seul appel.
 */
export type PipelineRunWithSteps = PipelineRun & {
  steps: PipelineStep[]
  domain: Domain
  article: Article | null
  topic: Topic | null
}

/**
 * Sorties déjà produites par les étapes précédentes du même run, telles que
 * l'orchestrateur (Task 5) choisit de les exposer à `buildInput`. Aucun des
 * trois handlers de ce lot ne s'appuie dessus : ils relisent directement
 * `PipelineStep.output` sur `run.steps`, pour que la source de vérité du
 * rejeu reste unique et ne dépende pas d'une construction intermédiaire
 * propre à l'orchestrateur. Le paramètre existe néanmoins dans le contrat
 * pour les besoins d'un futur handler qui n'aurait pas besoin de relire
 * l'historique complet.
 */
export type StepOutputs = Partial<Record<StepType, unknown>>

export interface StepContext {
  correlationId?: string
}

/**
 * Contrat commun à toute étape exécutable du pipeline. `buildInput` est
 * délibérément synchrone et pure : c'est elle qui porte TOUTE la
 * réutilisation du contexte déjà persisté (voir `handlers/draft.handler.ts`,
 * qui relit l'`OUTLINE` déjà en base plutôt que de le régénérer), ce qui rend
 * le rejeu d'une étape possible sans refaire les précédentes.
 *
 * `execute`, lui, est le seul endroit qui peut appeler l'IA ou tout autre
 * service externe — jamais `buildInput`.
 */
export interface StepHandler<I, O> {
  readonly type: StepType
  buildInput(run: PipelineRunWithSteps, previous: StepOutputs): I
  execute(input: I, ctx: StepContext): Promise<O>
}
