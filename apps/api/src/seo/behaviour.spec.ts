import { parse } from '../markdown/parse'
import { analyze, CRITERION_WEIGHTS } from './index'
import type { SeoContext } from './types'

/**
 * Vérification du comportement de l'analyseur sur un article réaliste, par
 * opposition aux fixtures minimales des tests unitaires de chaque critère.
 *
 * L'enjeu : au Lot 2, l'IA lira ce score pour décider si un article est
 * publiable. Un score qui se comporte mal sur du contenu réel — et non sur
 * des cas d'école — l'induirait en erreur.
 */

const corps = `# Le Zero Trust en entreprise

Le **Zero Trust** part d'un principe simple : aucune entité n'est fiable par
défaut, qu'elle soit à l'intérieur ou à l'extérieur du réseau. Cette approche
remplace le modèle du périmètre par une vérification continue.

## Pourquoi le périmètre ne suffit plus

Le télétravail et le cloud ont dissous la frontière du réseau. Un poste
compromis à l'intérieur disposait autrefois d'un accès large. Le Zero Trust
supprime cette confiance implicite.

Voir aussi [notre guide sur le cloud](/articles/securite-cloud) et la
[publication du NIST](https://www.nist.gov/publications).

## Les trois piliers

Le Zero Trust repose sur la vérification de l'identité, la validation de
l'appareil, et le moindre privilège. Chaque requête est évaluée.

![Schéma des piliers du Zero Trust](/img/zero-trust.png)

### Vérifier l'identité

L'authentification forte est le socle. Le Zero Trust exige une preuve à
chaque accès, pas une fois par session.

### Valider l'appareil

Un utilisateur légitime sur un poste compromis reste un risque. Le Zero Trust
évalue la posture de l'appareil : correctifs appliqués, chiffrement du disque,
agent de sécurité actif. Un appareil non conforme se voit refuser l'accès aux
ressources sensibles, même avec des identifiants valides.

### Appliquer le moindre privilège

Chaque accès accordé doit être le plus étroit possible, et limité dans le
temps. Un développeur qui a besoin de consulter une base de production pendant
une intervention obtient cet accès pour la durée de l'intervention, pas de
façon permanente. Cette discipline réduit considérablement la surface exposée
en cas de compromission d'un compte.

## Par où commencer

Une démarche Zero Trust ne se déploie pas d'un bloc. Les organisations qui
réussissent commencent par cartographier leurs ressources critiques, puis
appliquent la vérification continue sur ce périmètre restreint avant de
l'étendre. Cette progressivité permet de mesurer l'impact sur les utilisateurs
et d'ajuster les règles avant qu'elles ne deviennent bloquantes à grande
échelle.

L'authentification multifacteur constitue presque toujours la première étape
concrète, parce qu'elle apporte un bénéfice immédiat pour un coût de mise en
oeuvre modéré. Vient ensuite la segmentation du réseau, puis la gestion fine
des identités et des habilitations.

## Les erreurs fréquentes

La première erreur consiste à traiter le Zero Trust comme un produit à acheter
plutôt que comme une architecture à construire. Aucun éditeur ne vend une
démarche complète. La seconde consiste à négliger l'expérience utilisateur :
des contrôles trop rigides poussent les équipes à contourner les règles, ce
qui dégrade la sécurité au lieu de l'améliorer.

## Conclusion

Le Zero Trust est une démarche progressive, pas un interrupteur. Commencer par
les accès les plus sensibles, mesurer, puis étendre reste la stratégie la plus
efficace pour une organisation qui part d'un modèle périmétrique classique.
`

const contexteComplet: SeoContext = {
  seoTitle: 'Le Zero Trust en entreprise : principes et mise en oeuvre',
  metaDescription:
    "Le Zero Trust supprime la confiance implicite du reseau. Decouvrez ses trois piliers, ses benefices concrets et comment amorcer la demarche par etapes.",
  focusKeyword: 'Zero Trust',
  slug: 'zero-trust-en-entreprise',
  language: 'fr',
}

const ast = parse(corps)

describe('analyseur SEO — comportement sur un article réaliste', () => {
  it('le barème totalise exactement 100', () => {
    const total = Object.values(CRITERION_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
  })

  it('note correctement un article bien construit, sans plafonnement', () => {
    const rapport = analyze(ast, contexteComplet)
    expect(rapport.cappedBy).toHaveLength(0)
    expect(rapport.score).toBeGreaterThanOrEqual(70)
    expect(rapport.score).toBeLessThanOrEqual(100)
  })

  it('plafonne à 60 exactement quand la meta description manque', () => {
    const rapport = analyze(ast, { ...contexteComplet, metaDescription: null })
    expect(rapport.cappedBy.length).toBeGreaterThanOrEqual(1)
    expect(rapport.score).toBe(60)
  })

  it('plafonne toujours à 60 avec plusieurs fautes bloquantes', () => {
    const sansH1 = parse('## Pas de titre principal\n\nTrop court.')
    const rapport = analyze(sansH1, { ...contexteComplet, metaDescription: null })
    expect(rapport.cappedBy.length).toBeGreaterThanOrEqual(2)
    expect(rapport.score).toBeLessThanOrEqual(60)
  })

  it('expose pourquoi le score est plafonné, pas seulement qu il l est', () => {
    const rapport = analyze(ast, { ...contexteComplet, metaDescription: null })
    // L'interface et l'IA du Lot 2 doivent pouvoir agir sur cette information.
    expect(rapport.cappedBy.every((code) => typeof code === 'string' && code.length > 0)).toBe(true)
    expect(rapport.issues.some((i) => i.severity === 'BLOCKING')).toBe(true)
  })

  it('ne signale aucune anomalie de mot-clé quand il est absent', () => {
    // La propriété qui compte est l'absence de PÉNALITÉ, pas l'égalité des
    // scores. Le barème est une moyenne pondérée à crédit partiel : une
    // catégorie parfaitement satisfaite tire la moyenne vers le haut, donc la
    // retirer fait mécaniquement baisser le score d'un article dont les autres
    // critères sont moyens. Ce n'est pas une pénalité pour donnée absente,
    // c'est la disparition d'un bonus — et la garantie réellement spécifiée
    // (les deux cas peuvent atteindre 100) est vérifiée dans analyzer.spec.ts.
    const sans = analyze(ast, { ...contexteComplet, focusKeyword: null })
    expect(sans.issues.some((i) => i.code.startsWith('KEYWORD'))).toBe(false)
    expect(sans.cappedBy).toHaveLength(0)
  })

  it('trouve le mot-clé malgré l elision et la casse', () => {
    const texte = parse("# L'IA générative\n\nL'IA transforme les usages. L'IA progresse vite.")
    const rapport = analyze(texte, {
      ...contexteComplet,
      seoTitle: "L'IA générative : ce qui change vraiment pour les entreprises",
      focusKeyword: 'IA',
    })
    expect(rapport.issues.some((i) => i.code === 'KEYWORD_MISSING_IN_H1')).toBe(false)
  })

  it('mesure la lisibilité différemment selon la langue', () => {
    const fr = analyze(ast, { ...contexteComplet, language: 'fr' })
    const en = analyze(ast, { ...contexteComplet, language: 'en' })
    const lisibiliteFr = fr.metrics.readability
    const lisibiliteEn = en.metrics.readability
    expect(lisibiliteFr).toBeDefined()
    expect(lisibiliteEn).toBeDefined()
    expect(lisibiliteFr).not.toBe(lisibiliteEn)
  })

  it('neutralise la lisibilité sur une langue non couverte sans fausser le score', () => {
    const de = analyze(ast, { ...contexteComplet, language: 'de' })
    expect(de.issues.some((i) => i.severity === 'INFO')).toBe(true)
    expect(de.score).toBeGreaterThan(0)
    expect(de.score).toBeLessThanOrEqual(100)
  })

  it('ne lève jamais, même sur un document vide', () => {
    expect(() =>
      analyze(parse(''), { seoTitle: null, metaDescription: null, focusKeyword: null, slug: '', language: 'fr' }),
    ).not.toThrow()
  })

  it('est déterministe : deux analyses identiques donnent le même score', () => {
    const a = analyze(ast, contexteComplet)
    const b = analyze(ast, contexteComplet)
    expect(a.score).toBe(b.score)
    expect(a.issues).toEqual(b.issues)
  })
})
