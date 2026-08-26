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
 */
export interface CriterionResult {
  code: string
  earned: number
  max: number
  issues: SeoIssue[]
  skipped?: boolean
}

export interface SeoReportData {
  score: number
  cappedBy: string[]
  issues: SeoIssue[]
  metrics: Record<string, number>
}
