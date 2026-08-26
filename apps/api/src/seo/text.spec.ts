import { containsKeyword, countKeywordOccurrences, extractPlainText, firstWords } from './text'
import { parse } from '../markdown'

describe('containsKeyword / countKeywordOccurrences', () => {
  it("ne compte pas 'seo' comme sous-chaîne de 'seomanager'", () => {
    expect(countKeywordOccurrences('Cet outil est un seomanager reconnu.', 'seo')).toBe(0)
    expect(containsKeyword('Cet outil est un seomanager reconnu.', 'seo')).toBe(false)
  })

  it("trouve 'seo' comme mot entier", () => {
    expect(countKeywordOccurrences('Le seo est essentiel.', 'seo')).toBe(1)
    expect(containsKeyword('Le seo est essentiel.', 'seo')).toBe(true)
  })

  it('ignore la casse', () => {
    expect(containsKeyword('Le SEO est essentiel.', 'seo')).toBe(true)
    expect(containsKeyword('le seo est essentiel', 'SEO')).toBe(true)
  })

  it('gère les accents français (recherche exacte, insensible à la casse uniquement)', () => {
    expect(containsKeyword('La randonnée en montagne.', 'randonnée')).toBe(true)
    expect(containsKeyword('La RANDONNÉE en montagne.', 'randonnée')).toBe(true)
    // Un mot sans l'accent ne doit pas correspondre à sa variante accentuée :
    // ce sont deux mots français différents, pas une variante graphique.
    expect(containsKeyword('La randonnee en montagne.', 'randonnée')).toBe(false)
  })

  it("traite l'apostrophe (typographique et dactylographique) comme séparateur de mots", () => {
    expect(containsKeyword("L'IA transforme le secteur.", 'IA')).toBe(true)
    expect(containsKeyword('L’IA transforme le secteur.', 'IA')).toBe(true)
    expect(containsKeyword("l'article est publié.", 'article')).toBe(true)
  })

  it('trouve un mot-clé composé de plusieurs mots comme séquence contiguë', () => {
    expect(containsKeyword('Le cancer du sein touche de nombreuses personnes.', 'cancer du sein')).toBe(true)
    expect(containsKeyword('Le cancer touche du sein.', 'cancer du sein')).toBe(false)
  })

  it('compte plusieurs occurrences du mot-clé', () => {
    const text = 'La randonnée est belle. Cette randonnée dure trois heures. La randonnée se termine au sommet.'
    expect(countKeywordOccurrences(text, 'randonnée')).toBe(3)
  })

  it('renvoie 0/false pour un mot-clé vide ou un texte vide, sans lever', () => {
    expect(() => countKeywordOccurrences('', 'seo')).not.toThrow()
    expect(countKeywordOccurrences('', 'seo')).toBe(0)
    expect(countKeywordOccurrences('un texte quelconque', '')).toBe(0)
  })
})

describe('extractPlainText', () => {
  it("insère un espace entre le texte de deux paragraphes distincts", () => {
    const md = ['Premier paragraphe.', '', 'Second paragraphe.'].join('\n')
    const text = extractPlainText(parse(md))
    expect(text).not.toMatch(/paragraphe\.Second/)
    expect(text).toContain('Premier paragraphe. Second paragraphe.')
  })

  it('renvoie une chaîne vide pour un document vide, sans lever', () => {
    expect(() => extractPlainText(parse(''))).not.toThrow()
    expect(extractPlainText(parse(''))).toBe('')
  })
})

describe('firstWords', () => {
  it('renvoie les N premiers mots seulement', () => {
    expect(firstWords('un deux trois quatre cinq', 3)).toBe('un deux trois')
  })

  it("renvoie tout le texte s'il contient moins de N mots", () => {
    expect(firstWords('un deux', 100)).toBe('un deux')
  })
})
