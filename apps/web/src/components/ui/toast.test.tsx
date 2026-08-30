import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider, useToast } from './toast'

function TestButtons() {
  const { showToast } = useToast()
  return (
    <>
      <button onClick={() => showToast({ title: 'Sujet sélectionné', variant: 'success' })}>Succès</button>
      <button onClick={() => showToast({ title: 'Échec de la sélection', variant: 'error' })}>Erreur</button>
    </>
  )
}

describe('ToastProvider / useToast', () => {
  it('affiche un toast déclenché via useToast, annoncé par role="status"', () => {
    render(
      <ToastProvider>
        <TestButtons />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Succès'))
    const message = screen.getByText('Sujet sélectionné')
    expect(message.closest('[role="status"]')).not.toBeNull()
  })

  it('distingue visuellement les variantes succès et erreur', () => {
    render(
      <ToastProvider>
        <TestButtons />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Succès'))
    const successToast = screen.getByText('Sujet sélectionné').closest('li')
    expect(successToast?.className).toMatch(/emerald/)

    fireEvent.click(screen.getByText('Erreur'))
    const errorToast = screen.getByText('Échec de la sélection').closest('li')
    expect(errorToast?.className).toMatch(/red/)
  })

  it('peut être fermé manuellement', () => {
    render(
      <ToastProvider>
        <TestButtons />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Succès'))
    expect(screen.getByText('Sujet sélectionné')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }))
    expect(screen.queryByText('Sujet sélectionné')).toBeNull()
  })

  it('useToast lève une erreur explicite hors ToastProvider', () => {
    function Broken() {
      useToast()
      return null
    }
    // React logge une erreur dans la console pour tout throw pendant le rendu ;
    // on la neutralise ici pour garder une sortie de test propre.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Broken />)).toThrow('useToast doit être utilisé sous <ToastProvider>')
    consoleError.mockRestore()
  })
})
