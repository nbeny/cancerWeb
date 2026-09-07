/**
 * Abstraction bas niveau au-dessus d'un modèle de langage : ni le pipeline ni
 * le service métier ne doivent connaître le fournisseur concret (CLI, HTTP,
 * fake). Chaque implémentation vit dans `providers/` et ne dépend d'aucune
 * brique NestJS au-delà de `@Injectable` — pas de Prisma, pas de logique
 * métier, pour rester testable en isolation totale.
 */

export interface CompletionRequest {
  prompt: string
  model?: string
  timeoutMs?: number
  correlationId?: string
}

export interface CompletionResult {
  /** Contenu utile de la réponse — jamais du bruit de terminal (ANSI, logs). */
  text: string
  /** Sortie brute (tronquée) conservée pour diagnostic, jamais parsée. */
  raw?: string
  durationMs: number
  /**
   * Comptage de tokens, quand le fournisseur les expose. Reste `undefined`
   * avec `CliAgentProvider` : le CLI ne les fournit pas, et c'est assumé —
   * ce n'est pas un oubli à combler plus tard.
   */
  promptTokens?: number
  completionTokens?: number
  costCents?: number
}

export interface ProviderHealth {
  ok: boolean
  detail?: string
}

export interface AIProvider {
  readonly key: string
  complete(req: CompletionRequest): Promise<CompletionResult>
  health(): Promise<ProviderHealth>
}

export const AI_PROVIDER = Symbol('AI_PROVIDER')

/** Valeurs acceptées par la variable d'environnement `AI_PROVIDER`. */
export const AI_PROVIDER_KEYS = ['fake', 'cli', 'http'] as const
export type AIProviderKey = (typeof AI_PROVIDER_KEYS)[number]
