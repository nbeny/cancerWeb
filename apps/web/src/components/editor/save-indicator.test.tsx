import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { SaveIndicator } from './save-indicator'

describe('SaveIndicator', () => {
  it('affiche « Modifications non enregistrées » pour le statut unsaved', () => {
    render(<SaveIndicator status="unsaved" />)
    expect(screen.getByText('Modifications non enregistrées')).toBeDefined()
  })

  it('affiche « Enregistrement… » pour le statut saving', () => {
    render(<SaveIndicator status="saving" />)
    expect(screen.getByText('Enregistrement…')).toBeDefined()
  })

  it('affiche « Enregistré » pour le statut saved', () => {
    render(<SaveIndicator status="saved" />)
    expect(screen.getByText('Enregistré')).toBeDefined()
  })

  it('affiche « Échec de l’enregistrement » et le message d’erreur pour le statut error', () => {
    render(<SaveIndicator status="error" errorMessage="Le serveur ne répond pas" />)
    expect(screen.getByText('Échec de l’enregistrement')).toBeDefined()
    expect(screen.getByText('Le serveur ne répond pas')).toBeDefined()
  })

  it('propose un bouton Réessayer qui appelle onRetry, uniquement en erreur', () => {
    const onRetry = vi.fn()
    render(<SaveIndicator status="error" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('n’affiche pas de bouton Réessayer hors erreur', () => {
    render(<SaveIndicator status="saved" onRetry={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('annonce les transitions via role="status" (aria-live)', () => {
    render(<SaveIndicator status="saving" />)
    expect(screen.getByRole('status')).toBeDefined()
  })
})
