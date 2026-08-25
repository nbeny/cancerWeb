import { render, screen } from '@testing-library/react'
import { StatusBadge } from './status-badge'

describe('StatusBadge', () => {
  it('affiche un libellé français pour chaque statut', () => {
    render(<StatusBadge status="REVIEW" />)
    expect(screen.getByText('En revue')).toBeDefined()
  })

  it('applique une couleur distincte selon le statut', () => {
    const { container: draft } = render(<StatusBadge status="DRAFT" />)
    const { container: published } = render(<StatusBadge status="PUBLISHED" />)
    expect(draft.firstChild).not.toEqual(published.firstChild)
  })
})
