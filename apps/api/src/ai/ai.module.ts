import { Module } from '@nestjs/common'
import { AI_PROVIDER, AIProvider, AIProviderKey } from './ai.types'
import { FakeAIProvider } from './providers/fake.provider'
import { CliAgentProvider } from './providers/cli.provider'
import { AITaskService } from './ai-task.service'

const ACCEPTED_KEYS = 'fake, cli, http'

/**
 * Sélectionne l'implémentation concrète à brancher sur le jeton AI_PROVIDER
 * selon la valeur de la variable d'environnement du même nom. Extraite de la
 * factory Nest pour rester testable comme une fonction pure, sans bootstrap
 * de module : une valeur absente, inconnue ou pas encore câblée doit
 * toujours échouer bruyamment, jamais retomber sur `fake` en silence — ce
 * qui ferait tourner de la génération factice en production sans que
 * personne ne s'en aperçoive.
 */
export function selectAIProvider(
  key: AIProviderKey,
  available: { fake: AIProvider; cli: AIProvider },
): AIProvider {
  switch (key) {
    case 'fake':
      return available.fake
    case 'cli':
      return available.cli
    case 'http':
      throw new Error("AI_PROVIDER=http : aucun HttpAIProvider n'est implémenté pour l'instant.")
    default:
      throw new Error(`AI_PROVIDER invalide : "${String(key)}". Valeurs acceptées : ${ACCEPTED_KEYS}.`)
  }
}

@Module({
  providers: [
    FakeAIProvider,
    CliAgentProvider,
    {
      provide: AI_PROVIDER,
      inject: [FakeAIProvider, CliAgentProvider],
      useFactory: (fake: FakeAIProvider, cli: CliAgentProvider): AIProvider => {
        const raw = process.env.AI_PROVIDER
        if (!raw) {
          throw new Error(`AI_PROVIDER doit être définie. Valeurs acceptées : ${ACCEPTED_KEYS}.`)
        }
        return selectAIProvider(raw as AIProviderKey, { fake, cli })
      },
    },
    // Câblé ici (Task 5) : jusqu'à ce lot, `AITaskService` n'était instancié
    // qu'à la main dans ses tests unitaires (`new AITaskService(fake)`),
    // jamais par le conteneur Nest — aucun consommateur n'existait encore.
    // C'est `PipelineModule` qui l'injecte désormais dans les handlers
    // OUTLINE/DRAFT.
    AITaskService,
  ],
  exports: [AI_PROVIDER, AITaskService],
})
export class AiModule {}
