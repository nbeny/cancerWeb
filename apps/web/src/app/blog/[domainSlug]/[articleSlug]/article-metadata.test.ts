import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'
import { metadonneesArticle } from './article-metadata'

function article(surcharges: Partial<PublicArticleFieldsFragment> = {}): PublicArticleFieldsFragment {
  return {
    id: 'a1',
    slug: 'mon-article',
    title: 'Titre affiché',
    excerpt: 'Extrait lisible',
    renderedHtml: '<p>Corps</p>',
    coverImageUrl: null,
    wordCount: 42,
    publishedAt: '2026-03-14T09:00:00.000Z',
    seoTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    robotsIndex: true,
    robotsFollow: true,
    ...surcharges,
  }
}

describe('metadonneesArticle', () => {
  it('préfère seoTitle au titre affiché quand il est renseigné', () => {
    expect(metadonneesArticle(article({ seoTitle: 'Titre court pour Google' })).title).toBe(
      'Titre court pour Google',
    )
  })

  it('retombe sur le titre affiché quand seoTitle est absent', () => {
    expect(metadonneesArticle(article({ seoTitle: null })).title).toBe('Titre affiché')
  })

  it('préfère metaDescription à excerpt quand elle est renseignée', () => {
    expect(
      metadonneesArticle(article({ metaDescription: 'Description SEO' })).description,
    ).toBe('Description SEO')
  })

  it("retombe sur l'extrait quand metaDescription est absente", () => {
    expect(metadonneesArticle(article({ metaDescription: null })).description).toBe('Extrait lisible')
  })

  // Une description vide vaudrait mieux que rien pour un moteur ? Non : une
  // balise `description` vide est un signal négatif, l'absence de balise n'en
  // est pas un.
  it('omet la description quand ni metaDescription ni excerpt ne sont renseignés', () => {
    expect(metadonneesArticle(article({ metaDescription: null, excerpt: null })).description).toBeUndefined()
  })

  it("expose l'URL canonique telle quelle quand elle est renseignée", () => {
    expect(
      metadonneesArticle(article({ canonicalUrl: 'https://exemple.fr/mon-article' })).alternates?.canonical,
    ).toBe('https://exemple.fr/mon-article')
  })

  // Le repli tentant (fabriquer l'URL à partir du slug) demanderait aux
  // moteurs de désindexer l'article au profit d'une adresse potentiellement
  // fausse : on n'émet rien.
  it("n'invente aucune URL canonique quand le champ est vide", () => {
    expect(metadonneesArticle(article({ canonicalUrl: null })).alternates?.canonical).toBeUndefined()
  })

  // Les deux directions sont vérifiées : c'est exactement le genre de
  // correspondance qu'une inversion rendrait silencieuse.
  it('traduit robotsIndex/robotsFollow à vrai en index + follow', () => {
    expect(metadonneesArticle(article({ robotsIndex: true, robotsFollow: true })).robots).toEqual({
      index: true,
      follow: true,
    })
  })

  it('traduit robotsIndex/robotsFollow à faux en noindex + nofollow', () => {
    expect(metadonneesArticle(article({ robotsIndex: false, robotsFollow: false })).robots).toEqual({
      index: false,
      follow: false,
    })
  })

  it('traite les deux directives indépendamment (noindex mais follow)', () => {
    expect(metadonneesArticle(article({ robotsIndex: false, robotsFollow: true })).robots).toEqual({
      index: false,
      follow: true,
    })
  })
})
