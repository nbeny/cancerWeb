import { render, screen } from '@testing-library/react'
import { ArticlePreview, STRIP_TAGS } from './preview'

describe('ArticlePreview', () => {
  it('rend le Markdown saisi', () => {
    const { container } = render(<ArticlePreview markdown={'# Titre\n\nTexte'} />)
    expect(container.querySelector('h1')?.textContent).toBe('Titre')
    expect(container.querySelector('p')?.textContent).toBe('Texte')
  })

  it('rend les extensions GFM (tableaux), comme le rendu serveur', () => {
    const md = ['| a | b |', '| - | - |', '| 1 | 2 |'].join('\n')
    const { container } = render(<ArticlePreview markdown={md} />)
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('td')).toHaveLength(2)
  })

  it('retire une balise active ET son contenu, sans le laisser fuir en texte', () => {
    const { container } = render(<ArticlePreview markdown={'<script>alert(1)</script>\n\nAprès'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).not.toContain('alert(1)')
    expect(screen.getByText('Après')).toBeDefined()
  })

  it('retire les attributs porteurs de comportement et les URL javascript:', () => {
    const md = '<img src="x" onerror="alert(1)">\n\n[lien](javascript:alert(1))'
    const { container } = render(<ArticlePreview markdown={md} />)
    expect(container.querySelector('[onerror]')).toBeNull()
    // Le lien reste affiché, mais `href` est retiré et non réécrit : le
    // schéma `javascript:` n'atteint jamais le DOM.
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull()
  })

  // Cette liste doit rester identique à `STRIP_CONTENT_TOO` dans
  // `apps/api/src/markdown/render.ts` : c'est ce qui garantit que l'aperçu
  // client et le HTML publié retirent exactement les mêmes éléments. Le test
  // échoue si l'une des deux dérive sans que l'autre suive.
  it('strippe la même liste de balises à contenu brut que le rendu serveur', () => {
    expect(STRIP_TAGS).toEqual(['script', 'style', 'textarea', 'iframe', 'title', 'noframes', 'xmp', 'form'])
  })

  it('invite à écrire plutôt que d’afficher un cadre vide', () => {
    render(<ArticlePreview markdown="   " />)
    expect(screen.getByText('L’aperçu s’affichera ici au fur et à mesure de la rédaction.')).toBeDefined()
  })
})
