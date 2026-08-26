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
 */
export function analyze(ast: Root, ctx: SeoContext): SeoReportData {
  const results = CRITERIA.map((evaluate) => evaluate(ast, ctx))
  const applicable = results.filter((r) => !r.skipped)

  const max = applicable.reduce((sum, r) => sum + r.max, 0)
  const earned = applicable.reduce((sum, r) => sum + r.earned, 0)

  const issues = results.flatMap((r) => r.issues)
  const blocking = issues.filter((i) => i.severity === 'BLOCKING')

  const raw = max > 0 ? Math.round((earned / max) * 100) : 0
  const score = blocking.length > 0 ? Math.min(raw, 60) : raw

  return {
    score,
    cappedBy: blocking.map((i) => i.code),
    issues,
    metrics: buildMetrics(ast),
  }
}
