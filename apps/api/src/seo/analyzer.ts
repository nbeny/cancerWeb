import type { Root } from 'mdast'
import { countWords, extractHeadings, extractImages, extractLinks } from '../markdown'
import { evaluateTitle } from './criteria/title'
import { evaluateMetaDescription } from './criteria/meta-description'
import { evaluateHeadings } from './criteria/headings'
import { evaluateKeyword } from './criteria/keyword'
import { evaluateLength } from './criteria/length'
import { evaluateLinks } from './criteria/links'
import { evaluateReadability } from './criteria/readability'
import { evaluateImages } from './criteria/images'
import type { CriterionResult, SeoContext, SeoReportData } from './types'

/**
 * Barème déclaratif : le poids de chaque critère, indépendant de son
 * exécution. Sert de garde-fou (voir `analyzer.spec.ts`, "le total des
 * poids vaut 100") contre l'erreur qu'une relecture ne voit jamais — un
 * poids qui dérive silencieusement d'un critère à l'autre fausserait tous
 * les scores produits par l'analyseur.
 */
export const CRITERION_WEIGHTS: Record<string, number> = {
  TITLE: 20,
  META_DESCRIPTION: 15,
  HEADINGS: 15,
  KEYWORD: 15,
  LENGTH: 10,
  LINKS: 10,
  READABILITY: 10,
  IMAGES: 5,
}

type Criterion = (ast: Root, ctx: SeoContext) => CriterionResult

/**
 * Codes des fautes bloquantes d'une liste d'issues — exactement celles qui
 * plafonnent le score à 60 (voir la jsdoc de `analyze` ci-dessous). Exportée
 * pour rester l'UNIQUE définition de « qu'est-ce qui plafonne » : le
 * résolveur GraphQL `SeoReport.cappedBy` (voir `seo.resolver.ts`) la
 * réapplique aux `issues` persistées plutôt que de redéfinir la règle
 * séparément — si le plafonnement change un jour (seuil différent, faute
 * bloquante qui ne plafonne plus...), ce module reste le seul à modifier.
 * Signature volontairement structurelle (`{ code, severity }`, pas
 * `SeoIssue`) : elle s'applique aussi bien aux `SeoIssue` internes qu'au
 * type GraphQL du même nom, qui ne partagent pas le même type TypeScript
 * pour `severity` (union littérale ici, `string` côté GraphQL).
 */
export function blockingCodes(issues: Array<{ code: string; severity: string }>): string[] {
  return issues.filter((issue) => issue.severity === 'BLOCKING').map((issue) => issue.code)
}

const CRITERIA: Criterion[] = [
  evaluateTitle,
  evaluateMetaDescription,
  evaluateHeadings,
  evaluateKeyword,
  evaluateLength,
  evaluateLinks,
  evaluateReadability,
  evaluateImages,
]

function buildMetrics(ast: Root): Record<string, number> {
  const { internal, external } = extractLinks(ast)
  const images = extractImages(ast)

  return {
    wordCount: countWords(ast),
    h1Count: extractHeadings(ast).filter((h) => h.depth === 1).length,
    internalLinkCount: internal.length,
    externalLinkCount: external.length,
    imageCount: images.length,
    imageMissingAltCount: images.filter((image) => !image.alt).length,
  }
}

/**
 * Analyse déterministe et pure d'un article : combine les critères de
 * `criteria/*.ts` en un score sur 100 et une liste d'anomalies actionnables.
 *
 * Plafonnement (voir spec) : toute faute bloquante ramène le score brut à
 * 60 au maximum, quel que soit le nombre de fautes bloquantes — un article
 * ne peut pas se dire "presque publiable" tant qu'une des conditions
 * essentielles (H1 unique, meta description présente, longueur minimale)
 * n'est pas remplie.
 *
 * `max` exclut les critères neutralisés (`skipped: true`, ex. KEYWORD sans
 * `focusKeyword`, ou READABILITY pour une langue non couverte) : le score
 * reste sur 100 et reste comparable entre deux articles, l'un ayant
 * renseigné une donnée facultative et l'autre non.
 *
 * `metrics` fusionne les métriques structurelles calculées ici
 * (`buildMetrics`, indépendantes de tout critère : nombre de mots, de
 * liens, d'images...) avec celles que chaque critère a déjà calculées en
 * interne pour se noter (longueur du titre, densité de mot-clé, score de
 * lisibilité brut...). Ces dernières seraient sinon jetées après usage,
 * alors qu'elles sont exactement ce dont le panneau SEO de l'interface a
 * besoin pour afficher "142/158 caractères" en direct, et ce dont le
 * Lot 2 a besoin pour cibler une correction plutôt que de la recalculer
 * (et risquer de diverger de ce qui a réellement servi à noter l'article).
 * Métriques incluses même pour un critère neutralisé (`skipped`), quand
 * elles restent porteuses de sens (ex. `readabilitySupported: 0`).
 *
 * Règle de collision : les métriques d'un critère l'emportent sur celles de
 * `buildMetrics`, fusionnées dans l'ordre de `CRITERIA` (un critère plus
 * loin dans la liste l'emporte sur un précédent). Aucune collision
 * n'existe aujourd'hui entre les deux sources ni entre critères — la
 * fusion est néanmoins définie explicitement pour ne pas dépendre d'un
 * hasard de nommage si un critère futur réutilise une clé existante.
 */
export function analyze(ast: Root, ctx: SeoContext): SeoReportData {
  const results = CRITERIA.map((evaluate) => evaluate(ast, ctx))
  const applicable = results.filter((r) => !r.skipped)

  const max = applicable.reduce((sum, r) => sum + r.max, 0)
  const earned = applicable.reduce((sum, r) => sum + r.earned, 0)

  const issues = results.flatMap((r) => r.issues)
  const cappedBy = blockingCodes(issues)

  const raw = max > 0 ? Math.round((earned / max) * 100) : 0
  const score = cappedBy.length > 0 ? Math.min(raw, 60) : raw

  const metrics = results.reduce(
    (acc, r) => Object.assign(acc, r.metrics),
    buildMetrics(ast),
  )

  return {
    score,
    cappedBy,
    issues,
    metrics,
  }
}
