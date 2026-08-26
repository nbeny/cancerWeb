/**
 * Données fournies par l'appelant (le service, Task 9) et nécessaires à
 * l'analyse SEO, en plus du contenu Markdown lui-même. L'analyseur ne les
 * récupère jamais depuis une base ou un réseau : il est pur.
 */
export interface SeoContext {
  seoTitle: string | null
  metaDescription: string | null
  focusKeyword: string | null
  slug: string
  language: string
}

export type Severity = 'BLOCKING' | 'WARNING' | 'INFO'

/**
 * `code` est stable et machine-lisible : l'interface s'en sert pour amener
 * l'utilisateur au bon champ, et le Lot 2 pour décider quoi corriger. Le
 * `message`, en français, peut changer librement ; le `code`, jamais.
 */
export interface SeoIssue {
  code: string
  severity: Severity
  message: string
  field?: string
}

/**
 * Résultat d'un critère individuel. `skipped: true` signale une catégorie
 * neutralisée (donnée facultative absente, ou langue non couverte pour la
 * lisibilité) : elle ne doit alors compter ni dans les points gagnés ni dans
 * le total possible (voir `analyzer.ts`), pour ne pas pénaliser l'absence
 * d'une donnée facultative.
 *
 * `metrics` porte les valeurs numériques que le critère a déjà calculées
 * pour se noter (longueur du titre, densité de mot-clé, score de
 * lisibilité brut...) et qui ont un sens hors du calcul du score : le
 * panneau SEO de l'interface (Task 17) en a besoin pour afficher
 * "142/158 caractères" pendant la frappe, et le Lot 2 pour cibler ses
 * corrections ("raccourcir le titre de 12 caractères" plutôt que "le
 * titre est trop long"). Toujours renvoyées, même quand le critère est
 * neutralisé (`skipped`), quand elles ont un sens (ex. `readabilitySupported`
 * reste exposé pour une langue non couverte).
 */
export interface CriterionResult {
  code: string
  earned: number
  max: number
  issues: SeoIssue[]
  skipped?: boolean
  metrics?: Record<string, number>
}

export interface SeoReportData {
  score: number
  cappedBy: string[]
  issues: SeoIssue[]
  metrics: Record<string, number>
}
