import { parse } from './parse'
import { render } from './render'

describe('parse + render', () => {
  it('rend le Markdown nominal (titres, gras, liens, listes) en HTML correspondant', () => {
    const md = [
      '# Titre',
      '',
      'Un paragraphe en **gras** avec un [lien](https://example.com).',
      '',
      '- item 1',
      '- item 2',
    ].join('\n')

    const html = render(parse(md))

    expect(html).toContain('<h1>Titre</h1>')
    expect(html).toContain('<strong>gras</strong>')
    expect(html).toContain('<a href="https://example.com">lien</a>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>item 1</li>')
    expect(html).toContain('<li>item 2</li>')
  })

  it('supprime entièrement une balise <script> injectée dans le Markdown', () => {
    const md = 'Bonjour <script>alert(1)</script> le monde.'

    const html = render(parse(md))

    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it("retire l'attribut onerror d'une image injectée", () => {
    const md = '<img src=x onerror=alert(1)>'

    const html = render(parse(md))

    expect(html).not.toContain('onerror')
  })

  it("neutralise un lien avec le schéma javascript:", () => {
    const md = '[lien](javascript:alert(1))'

    const html = render(parse(md))

    expect(html).not.toContain('javascript:alert')
    expect(html).not.toMatch(/href="javascript:/)
  })

  it('convertit un tableau GFM en balise <table>', () => {
    const md = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n')

    const html = render(parse(md))

    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('<td>2</td>')
  })

  it('renvoie une chaîne vide pour une entrée vide, sans exception', () => {
    expect(() => render(parse(''))).not.toThrow()
    expect(render(parse(''))).toBe('')
  })
})
