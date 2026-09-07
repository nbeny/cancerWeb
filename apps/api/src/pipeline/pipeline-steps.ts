import { StepType } from '@prisma/client'

/**
 * Déclaration statique d'une étape du pipeline automatisé. `skipReason` est
 * **obligatoire** dès que `executable` vaut `false` (voir le test « toute
 * étape non exécutable a une raison de saut non vide » dans
 * `pipeline-steps.spec.ts`) : c'est ce qui garantit qu'aucune étape n'est
 * jamais sautée sans que l'utilisateur sache pourquoi. La raison est écrite
 * pour être lue telle quelle dans l'interface (Task 5+), pas pour un
 * développeur qui lirait les logs.
 */
export interface StepDefinition {
  type: StepType
  order: number
  executable: boolean
  skipReason?: string
}

/**
 * Table déclarative, pas une cascade de `if` : le pipeline de ce lot ne va
 * que jusqu'à `OUTLINE` → `DRAFT` → `SEO` (voir la décision cadrante du
 * design du Lot 2). Les autres étapes existent déjà dans le schéma Prisma
 * (`StepType`) pour ne pas avoir à le faire évoluer lot après lot, mais sont
 * sautées explicitement ici, avec une raison assumée plutôt qu'un
 * "TODO" — chacune sera activée par un lot futur nommé dans sa raison.
 *
 * `REVIEW` et `PUBLISH` (aussi présents dans l'enum Prisma `StepType`)
 * n'apparaissent volontairement pas ici : ce sont des transitions pilotées
 * par un humain (voir `articles/transitions.ts`), pas des étapes du
 * pipeline automatisé.
 */
export const STEP_DEFINITIONS: StepDefinition[] = [
  {
    type: StepType.RESEARCH,
    order: 1,
    executable: false,
    skipReason: "Non exécuté : aucune source de recherche externe n'est encore connectée à la plateforme.",
  },
  {
    type: StepType.ANALYSIS,
    order: 2,
    executable: false,
    skipReason: "Non exécuté : cette étape s'appuie sur les résultats de la recherche, elle-même indisponible pour l'instant.",
  },
  { type: StepType.OUTLINE, order: 3, executable: true },
  { type: StepType.DRAFT, order: 4, executable: true },
  {
    type: StepType.FACT_CHECK,
    order: 5,
    executable: false,
    skipReason: 'Non exécuté : la vérification des faits nécessite des sources fiables, pas encore disponibles.',
  },
  { type: StepType.SEO, order: 6, executable: true },
  {
    type: StepType.QUALITY,
    order: 7,
    executable: false,
    skipReason: "Non exécuté : ce contrôle de qualité éditoriale arrive dans une prochaine mise à jour.",
  },
]

/** La déclaration d'une étape par son type, ou une erreur explicite si le type n'est pas géré par le pipeline automatisé. */
export function getStepDefinition(type: StepType): StepDefinition {
  const definition = STEP_DEFINITIONS.find((d) => d.type === type)
  if (!definition) {
    throw new Error(`Aucune déclaration de pipeline pour l'étape ${type} : ce n'est pas une étape du pipeline automatisé.`)
  }
  return definition
}
