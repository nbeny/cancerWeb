import { parse } from './parse'
import { render } from './render'

/**
 * Batterie de sécurité de la chaîne de rendu.
 *
 * Le contenu Markdown viendra d'un modèle au Lot 2 et sera servi au public au
 * Lot 3 : cette chaîne est la seule barrière entre du HTML arbitraire et le
 * navigateur d'un visiteur. On teste donc une batterie de charges utiles
 * classiques, pas seulement les trois du plan.
 */
const html = (md: string): string => render(parse(md))

describe('sanitization — batterie de charges utiles', () => {
  it.each([
    ['balise script', '<script>alert(1)</script>', ['<script', 'alert(1)']],
    ['script majuscules', '<SCRIPT>alert(1)</SCRIPT>', ['<script', '<SCRIPT', 'alert(1)']],
    ['gestionnaire onerror', '<img src=x onerror=alert(1)>', ['onerror']],
    ['gestionnaire onload', '<body onload=alert(1)>', ['onload']],
    ['schéma javascript', '[clic](javascript:alert(1))', ['javascript:']],
    ['schéma data', '[clic](data:text/html,<script>alert(1)</script>)', ['data:text/html']],
    ['iframe', '<iframe src="https://evil.example"></iframe>', ['<iframe']],
    ['balise style', '<style>body{display:none}</style>', ['<style']],
    ['svg onload', '<svg onload=alert(1)></svg>', ['onload']],
    ['form', '<form action="https://evil.example"><input name="x"></form>', ['<form']],
  ])('neutralise : %s', (_libelle, payload, interdits) => {
    const sortie = html(payload)
    for (const interdit of interdits) {
      expect(sortie.toLowerCase()).not.toContain(interdit.toLowerCase())
    }
  })

  it('conserve le Markdown légitime intact', () => {
    const sortie = html('# Titre\n\nUn **gras**, un [lien](https://exemple.fr), une `commande`.')
    expect(sortie).toContain('<h1>')
    expect(sortie).toContain('<strong>')
    expect(sortie).toContain('href="https://exemple.fr"')
    expect(sortie).toContain('<code>')
  })

  it('conserve les images légitimes avec leur alt', () => {
    const sortie = html('![Une description](https://exemple.fr/i.png)')
    expect(sortie).toContain('alt="Une description"')
    expect(sortie).toContain('https://exemple.fr/i.png')
  })
})
