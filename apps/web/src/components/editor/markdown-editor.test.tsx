import { render } from '@testing-library/react'
import { MarkdownEditor } from './markdown-editor'

// Test de fumée uniquement : CodeMirror 6 a besoin d'un vrai navigateur pour
// son comportement interactif complet (mesure de layout, coloration
// syntaxique visuelle) — non reproductible utilement sous jsdom. Ce test
// vérifie seulement que le composant se monte sans lever d'exception avec le
// contenu initial fourni ; le comportement réel (coloration, retour à la
// ligne, numéros de ligne) est vérifié manuellement au `next dev` (voir le
// rapport de tâche).
describe('MarkdownEditor (test de fumée)', () => {
  it('se monte sans erreur avec une valeur initiale', () => {
    expect(() => render(<MarkdownEditor value="# Titre" onChange={() => {}} />)).not.toThrow()
  })

  it("affiche le contenu initial dans l'éditeur", () => {
    const { container } = render(<MarkdownEditor value="Bonjour le monde" onChange={() => {}} />)
    expect(container.textContent).toContain('Bonjour le monde')
  })
})
