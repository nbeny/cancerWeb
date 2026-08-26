import { parse } from '../markdown'
import { analyze, CRITERION_WEIGHTS } from './analyzer'
import type { SeoContext } from './types'

const focusKeyword = 'randonnée'
const seoTitle = 'Guide complet de la randonnée en montagne'
const metaDescription =
  'Découvrez notre guide complet de la randonnée en montagne : conseils pratiques, itinéraires simples et astuces pour bien préparer votre sortie.'

function buildBody(): string {
  const keywordSentence = 'Cette randonnée est simple et agréable pour toute la famille.'
  const fillerSentence = 'Le chat dort sur le tapis chaud et calme de la maison.'
  const paragraphs: string[] = []
  // 4 mentions du mot-clé dans le corps + 1 dans le H1 + 1 dans l'intro = 6
  // occurrences pour ~800 mots, soit une densité d'environ 0,75 % (0,5-2,5 %).
  for (let i = 0; i < 4; i++) {
    paragraphs.push(keywordSentence)
  }
  for (let i = 0; i < 12; i++) {
    paragraphs.push(Array.from({ length: 5 }, () => fillerSentence).join(' '))
  }
  return paragraphs.join('\n\n')
}

function buildPerfectMarkdown(h1Depth: 1 | 2 = 1): string {
  const h1Marker = '#'.repeat(h1Depth)
  return [
    `${h1Marker} Randonnée en montagne : le guide complet`,
    '',
    'La randonnée est une activité idéale pour se détendre en plein air et découvrir la nature à pied.',
    '',
    '## Bien préparer sa sortie',
    '',
    buildBody(),
    '',
    '## Ressources utiles',
    '',
    '[Voir nos conseils](/conseils-randonnee) et [office de tourisme](https://exemple-tourisme.fr)',
  ].join('\n')
}

function perfectContext(overrides: Partial<SeoContext> = {}): SeoContext {
  return {
    seoTitle,
    metaDescription,
    focusKeyword,
    slug: 'guide-randonnee-montagne',
    language: 'fr',
    ...overrides,
  }
}

describe('barème : le total des poids vaut 100', () => {
  it('la somme des poids déclarés par critère est exactement 100', () => {
    const total = Object.values(CRITERION_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    expect(total).toBe(100)
  })

  it('le barème couvre exactement les 8 critères attendus', () => {
    expect(Object.keys(CRITERION_WEIGHTS).sort()).toEqual(
      ['HEADINGS', 'IMAGES', 'KEYWORD', 'LENGTH', 'LINKS', 'META_DESCRIPTION', 'READABILITY', 'TITLE'].sort(),
    )
  })
})

describe('analyze', () => {
  it('note un article parfait à 95 ou plus, sans plafonnement', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext())

    expect(report.score).toBeGreaterThanOrEqual(95)
    expect(report.cappedBy).toEqual([])
  })

  it('plafonne à 60 exactement un article sans meta description, même si le brut dépasse 60', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext({ metaDescription: null }))

    expect(report.cappedBy).toEqual(['META_DESCRIPTION_MISSING'])
    expect(report.score).toBe(60)
  })

  it('plafonne aussi à 60 avec deux fautes bloquantes, et cappedBy en liste les deux', () => {
    // H1 absent (titre rétrogradé en H2) + meta description absente : deux
    // fautes bloquantes indépendantes.
    const report = analyze(parse(buildPerfectMarkdown(2)), perfectContext({ metaDescription: null }))

    expect(report.score).toBe(60)
    expect(report.cappedBy).toHaveLength(2)
    expect(report.cappedBy).toEqual(expect.arrayContaining(['META_DESCRIPTION_MISSING', 'H1_MISSING']))
  })

  it('note bas un article vide, sans jamais lever', () => {
    const emptyContext: SeoContext = {
      seoTitle: null,
      metaDescription: null,
      focusKeyword: null,
      slug: 'vide',
      language: 'fr',
    }

    expect(() => analyze(parse(''), emptyContext)).not.toThrow()
    const report = analyze(parse(''), emptyContext)

    expect(report.score).toBeLessThan(60)
    expect(Number.isFinite(report.score)).toBe(true)
  })

  it('neutralise KEYWORD (pas de note 0) quand focusKeyword est null, et peut quand même atteindre 100', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext({ focusKeyword: null }))

    expect(report.issues.some((issue) => issue.code.startsWith('KEYWORD'))).toBe(false)
    expect(report.score).toBe(100)
  })

  it('un article avec un mot-clé focus parfaitement utilisé peut aussi atteindre 100', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext())

    expect(report.score).toBe(100)
  })

  it('expose des métriques numériques de base', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext())

    expect(report.metrics.wordCount).toBeGreaterThan(600)
    expect(typeof report.metrics.wordCount).toBe('number')
  })

  it('expose les métriques calculées par chaque critère, pas seulement les métriques structurelles', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext())

    // L'interface (Task 17) affiche "142/158 caractères" en direct : elle a
    // besoin des longueurs déjà calculées par les critères, pas de les
    // recalculer côté client au risque de diverger.
    expect(report.metrics.seoTitleLength).toBe(seoTitle.length)
    expect(report.metrics.metaDescriptionLength).toBe(metaDescription.length)
    expect(typeof report.metrics.keywordDensity).toBe('number')
    expect(report.metrics.readabilitySupported).toBe(1)
    expect(typeof report.metrics.readability).toBe('number')
  })

  it('mesure la lisibilité différemment selon la langue, et l’expose dans le rapport', () => {
    // Preuve que la calibration par langue (Task 4) existe réellement et
    // n'est pas un paramètre ignoré : sur EXACTEMENT le même texte, le score
    // de lisibilité exposé dans le rapport diffère selon `language`.
    const markdown = parse(buildPerfectMarkdown())
    const fr = analyze(markdown, perfectContext({ language: 'fr' }))
    const en = analyze(markdown, perfectContext({ language: 'en' }))

    expect(fr.metrics.readability).toBeDefined()
    expect(en.metrics.readability).toBeDefined()
    expect(fr.metrics.readability).not.toBe(en.metrics.readability)
  })

  it('neutralise la lisibilité pour une langue non couverte sans faire disparaître le champ', () => {
    const report = analyze(parse(buildPerfectMarkdown()), perfectContext({ language: 'de' }))

    expect(report.metrics.readabilitySupported).toBe(0)
    expect(report.metrics.readability).toBeUndefined()
  })
})
