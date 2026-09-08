import { Inject, Injectable } from '@nestjs/common'
import type { Domain, Topic } from '@prisma/client'
import { AI_PROVIDER } from './ai.types'
import type { AIProvider } from './ai.types'
import type { Outline, TopicDraft } from './ai-task.types'
import { validateOutline } from './outline-validation'
import { parseTopics } from './parse-topics'
import { buildDraftPrompt } from './prompts/draft.prompt'
import { buildOutlinePrompt, buildOutlineRetryPrompt } from './prompts/outline.prompt'
import { buildTopicsPrompt } from './prompts/topics.prompt'

/**
 * Tâches métier de haut niveau, écrites UNE FOIS au-dessus de n'importe quel
 * `AIProvider` (`fake`, `cli`, `http` — voir `ai.types.ts`) : changer de
 * fournisseur ne touche aucune ligne de ce fichier.
 *
 * Ne dépend ni de Prisma ni du pipeline : chaque méthode prend des entités
 * en paramètre et rend des données, ce qui la rend testable avec
 * `FakeAIProvider` seul, sans conteneur Nest ni base de données (voir
 * `ai-task.service.spec.ts`). La persistance (Article, PipelineStep, AIJob)
 * est la responsabilité de l'orchestrateur du pipeline (Task 5), jamais de
 * ce service.
 */
@Injectable()
export class AITaskService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  /**
   * `existingTitles` remonte jusqu'au prompt pour que le modèle ne repropose
   * pas un sujet déjà présent sur le domaine (voir `buildTopicsPrompt`). Ce
   * service ne persiste rien et ne filtre rien : le rejet des doublons qui
   * passeraient malgré la consigne appartient à l'appelant
   * (`PipelineService.runTopicGenerationStep`).
   */
  async generateTopics(
    domain: Domain,
    count: number,
    existingTitles: string[] = [],
    correlationId?: string,
  ): Promise<TopicDraft[]> {
    const prompt = buildTopicsPrompt(domain, count, existingTitles)
    const result = await this.provider.complete({ prompt, correlationId })
    return parseTopics(result.text)
  }

  /**
   * Valide la sortie et relance **une seule fois**, en renvoyant au modèle la
   * raison précise du rejet ainsi que le plan refusé, avant d'échouer
   * proprement. Réessayer indéfiniment un modèle qui ne comprend pas le
   * format demandé brûlerait des minutes pour rien : avec le provider CLI
   * (`providers/cli.provider.ts`), chaque tentative coûte environ 58
   * secondes.
   */
  async generateOutline(domain: Domain, topic: Topic, correlationId?: string): Promise<Outline> {
    const firstResult = await this.provider.complete({ prompt: buildOutlinePrompt(domain, topic), correlationId })
    const firstValidation = validateOutline(firstResult.text, domain)
    if (firstValidation.valid) return firstValidation.outline

    const retryPrompt = buildOutlineRetryPrompt(domain, topic, firstValidation.reason, firstResult.text)
    const secondResult = await this.provider.complete({ prompt: retryPrompt, correlationId })
    const secondValidation = validateOutline(secondResult.text, domain)
    if (secondValidation.valid) return secondValidation.outline

    throw new Error(
      `Le modèle n'a pas produit de plan valide après une relance. Dernière raison de rejet : ${secondValidation.reason}`,
    )
  }

  async generateDraft(domain: Domain, topic: Topic, outline: Outline, correlationId?: string): Promise<string> {
    const result = await this.provider.complete({ prompt: buildDraftPrompt(domain, topic, outline), correlationId })
    return result.text
  }
}
