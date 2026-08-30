import type { StepType } from '@cancerweb/graphql'

/**
 * Libellés français des étapes du pipeline. Couvre tout `StepType` connu
 * côté API (y compris `REVIEW`/`PUBLISH`, jamais produits par le pipeline
 * automatisé aujourd'hui — voir `pipeline-steps.ts` côté API — et
 * `TOPIC_GENERATION`, l'étape unique d'un run `generateTopics`) : un
 * `Record` complet plutôt qu'un `Partial` fait échouer la compilation si un
 * nouveau `StepType` apparaît côté API sans traduction ici.
 */
export const STEP_LABELS: Record<StepType, string> = {
  RESEARCH: 'Recherche',
  ANALYSIS: 'Analyse',
  OUTLINE: 'Plan',
  DRAFT: 'Rédaction',
  FACT_CHECK: 'Vérification des faits',
  SEO: 'Optimisation SEO',
  QUALITY: 'Contrôle qualité',
  REVIEW: 'Revue éditoriale',
  PUBLISH: 'Publication',
  TOPIC_GENERATION: 'Génération de sujets',
}
