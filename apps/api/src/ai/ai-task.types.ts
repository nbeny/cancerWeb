/**
 * Types métier de haut niveau, produits et consommés par `AITaskService` et
 * ses collaborateurs (`outline-validation.ts`, `parse-topics.ts`, `prompts/`).
 * Distincts d'`ai.types.ts`, qui ne décrit que le contrat bas niveau d'un
 * fournisseur de complétion (`AIProvider`) — cette séparation est ce qui
 * permet à `AITaskService` de ne jamais fuiter vers les prompts un concept
 * propre à un fournisseur (ex. `raw`, `promptTokens`).
 */

/** Une section du plan, telle qu'extraite par `extractHeadings` (H2 et plus). */
export interface OutlineSection {
  title: string
  depth: number
}

/** Plan structuré, résultat de la validation d'un plan Markdown produit par le modèle. */
export interface Outline {
  h1: string
  sections: OutlineSection[]
}

export type OutlineValidation = { valid: true; outline: Outline } | { valid: false; reason: string }

/**
 * Sujet proposé par `generateTopics`, avant toute création de `Topic` en
 * base : c'est à l'appelant (Task 5/9) de décider s'il le persiste, avec
 * quel statut. `title` est la seule donnée garantie ; le reste dépend de ce
 * que le modèle (ou le format de sortie choisi) a fourni.
 */
export interface TopicDraft {
  title: string
  description?: string
  keywords?: string[]
  suggestedAngle?: string
  rationale?: string
}
