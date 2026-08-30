import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'

describe('ConfirmDialog', () => {
  it('affiche le titre et la description quand ouvert', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Rejeter ce sujet ?"
        description="« Test » sera marqué comme rejeté."
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Rejeter ce sujet ?')).toBeDefined()
    expect(screen.getByText('« Test » sera marqué comme rejeté.')).toBeDefined()
  })

  it('ne rend rien quand fermé', () => {
    render(<ConfirmDialog open={false} onOpenChange={vi.fn()} title="Rejeter ce sujet ?" onConfirm={vi.fn()} />)
    expect(screen.queryByText('Rejeter ce sujet ?')).toBeNull()
  })

  it('appelle onConfirm au clic sur le bouton de confirmation', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="Confirmer" confirmLabel="Rejeter" onConfirm={onConfirm} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('appelle onOpenChange(false) au clic sur Annuler', () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Confirmer" onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('ferme au clavier avec Échap', () => {
    const onOpenChange = vi.fn()
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Confirmer" onConfirm={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('applique la variante danger au bouton de confirmation', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Confirmer"
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Supprimer' }).className).toMatch(/bg-red/)
  })
})
