import { parse } from './parse'
import { extractHeadings, extractLinks, extractImages, countWords } from './extract'

describe('extractHeadings', () => {
  it('extrait les titres avec profondeur et numéro de ligne', () => {
    const md = ['# Titre 1', '', 'Un paragraphe.', '', '## Sous-titre'].join('\n')

    const headings = extractHeadings(parse(md))

    expect(headings).toEqual([
      { depth: 1, text: 'Titre 1', line: 1 },
      { depth: 2, text: 'Sous-titre', line: 5 },
    ])
  })

  it("ignore un '#' en début de ligne à l'intérieur d'un bloc de code", () => {
    const md = ['```', '# pas un titre', '```'].join('\n')

    expect(extractHeadings(parse(md))).toEqual([])
  })

  it("ignore un '#' à l'intérieur d'un code inline", () => {
    const md = 'Un paragraphe avec `# inline` dedans.'

    expect(extractHeadings(parse(md))).toEqual([])
  })

  it('renvoie un tableau vide pour un document vide, sans lever', () => {
    expect(() => extractHeadings(parse(''))).not.toThrow()
    expect(extractHeadings(parse(''))).toEqual([])
  })
})

describe('extractLinks', () => {
  it("ignore un lien à l'intérieur d'un bloc de code", () => {
    const md = ['```', '[a](b)', '```'].join('\n')

    const links = extractLinks(parse(md))

    expect(links.internal).toEqual([])
    expect(links.external).toEqual([])
  })

  it('classe un lien relatif comme interne', () => {
    const md = '[interne](/articles/x)'

    const links = extractLinks(parse(md))

    expect(links.internal).toEqual([{ href: '/articles/x', text: 'interne', line: 1 }])
    expect(links.external).toEqual([])
  })

  it('classe un lien http(s) absolu comme externe', () => {
    const md = '[externe](https://ailleurs.fr)'

    const links = extractLinks(parse(md))

    expect(links.external).toEqual([{ href: 'https://ailleurs.fr', text: 'externe', line: 1 }])
    expect(links.internal).toEqual([])
  })

  it("ne classe une ancre pure ni comme interne ni comme externe", () => {
    const md = '[ancre](#section)'

    const links = extractLinks(parse(md))

    expect(links.internal).toEqual([])
    expect(links.external).toEqual([])
  })

  it('renvoie des listes vides pour un document vide, sans lever', () => {
    expect(() => extractLinks(parse(''))).not.toThrow()
    const links = extractLinks(parse(''))
    expect(links.internal).toEqual([])
    expect(links.external).toEqual([])
  })
})

describe('extractImages', () => {
  it('extrait une image sans texte alternatif avec alt: null', () => {
    const md = '![](img.png)'

    expect(extractImages(parse(md))).toEqual([{ src: 'img.png', alt: null, line: 1 }])
  })

  it('traite un alt blanc/vide comme absent', () => {
    const md = '![ ](img.png)'

    expect(extractImages(parse(md))).toEqual([{ src: 'img.png', alt: null, line: 1 }])
  })

  it('extrait une image avec un alt renseigné', () => {
    const md = '![un chat](chat.png)'

    expect(extractImages(parse(md))).toEqual([{ src: 'chat.png', alt: 'un chat', line: 1 }])
  })

  it('renvoie un tableau vide pour un document vide, sans lever', () => {
    expect(() => extractImages(parse(''))).not.toThrow()
    expect(extractImages(parse(''))).toEqual([])
  })
})

describe('countWords', () => {
  it('compte les mots du texte rendu, pas les caractères de balisage', () => {
    // "**gras**" doit compter pour un seul mot, pas trois.
    expect(countWords(parse('**gras**'))).toBe(1)
  })

  it('compte les mots à travers plusieurs paragraphes', () => {
    const md = ['Un petit paragraphe.', '', 'Un second paragraphe ici.'].join('\n')
    expect(countWords(parse(md))).toBe(7)
  })

  it('renvoie 0 pour un document vide, sans lever', () => {
    expect(() => countWords(parse(''))).not.toThrow()
    expect(countWords(parse(''))).toBe(0)
  })
})
