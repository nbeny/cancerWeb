import { Module } from '@nestjs/common'
import { AI_PROVIDER, AIProvider, AIProviderKey } from './ai.types'
import { FakeAIProvider } from './providers/fake.provider'

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
export function selectAIProvider(key: AIProviderKey, available: { fake: AIProvider }): AIProvider {
  switch (key) {
    case 'fake':
      return available.fake
    case 'cli':
      throw new Error(
        "AI_PROVIDER=cli : CliAgentProvider n'est pas câblé dans AiModule pour l'instant.",
      )
    case 'http':
      throw new Error("AI_PROVIDER=http : aucun HttpAIProvider n'est implémenté pour l'instant.")
    default:
      throw new Error(`AI_PROVIDER invalide : "${String(key)}". Valeurs acceptées : ${ACCEPTED_KEYS}.`)
  }
}

@Module({
  providers: [
    FakeAIProvider,
    {
      provide: AI_PROVIDER,
      inject: [FakeAIProvider],
      useFactory: (fake: FakeAIProvider): AIProvider => {
        const raw = process.env.AI_PROVIDER
        if (!raw) {
          throw new Error(`AI_PROVIDER doit être définie. Valeurs acceptées : ${ACCEPTED_KEYS}.`)
        }
        return selectAIProvider(raw as AIProviderKey, { fake })
      },
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
