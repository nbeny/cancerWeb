import { render, screen } from '@testing-library/react'
import { ArticlePreview } from './preview'

describe('ArticlePreview', () => {
  it('affiche le HTML fourni tel quel (déjà sanitizé côté serveur)', () => {
    const { container } = render(<ArticlePreview html="<h1>Titre</h1><p>Texte</p>" />)
    expect(container.querySelector('h1')?.textContent).toBe('Titre')
    expect(container.querySelector('p')?.textContent).toBe('Texte')
  })

  it('signale visuellement un aperçu obsolète sans faire disparaître le contenu précédent', () => {
    render(<ArticlePreview html="<p>Ancien contenu</p>" stale />)
    expect(screen.getByText('Ancien contenu')).toBeDefined()
    expect(screen.getByText('Aperçu en cours de mise à jour…')).toBeDefined()
  })

  it("n'affiche pas l'indicateur d'obsolescence quand l'aperçu est à jour", () => {
    render(<ArticlePreview html="<p>x</p>" stale={false} />)
    expect(screen.queryByText('Aperçu en cours de mise à jour…')).toBeNull()
  })
})
