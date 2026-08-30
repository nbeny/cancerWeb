import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ToastProvider } from '@/components/ui/toast'
import { browserSdk } from '@/lib/graphql-client'
import { TransitionBar } from './transition-bar'

vi.mock('@/lib/graphql-client', () => ({
  browserSdk: {
    SubmitForReview: vi.fn(),
    RejectArticle: vi.fn(),
    ApproveArticle: vi.fn(),
    PublishArticle: vi.fn(),
    ScheduleArticle: vi.fn(),
    ArchiveArticle: vi.fn(),
  },
}))

function renderBar(
  status: Parameters<typeof TransitionBar>[0]['status'],
  onTransitioned = vi.fn(),
  myRole: Parameters<typeof TransitionBar>[0]['myRole'] = 'OWNER',
) {
  return render(
    <ToastProvider>
      <TransitionBar domainId="d1" articleId="a1" status={status} myRole={myRole} onTransitioned={onTransitioned} />
    </ToastProvider>,
  )
}

describe('TransitionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('propose « Soumettre pour relecture » depuis DRAFT', () => {
    renderBar('DRAFT')
    expect(screen.getByRole('button', { name: 'Soumettre pour relecture' })).toBeDefined()
  })

  it("n'affiche aucune action depuis ARCHIVED (statut terminal)", () => {
    renderBar('ARCHIVED')
    expect(screen.getByText('Aucune action de workflow disponible depuis ce statut.')).toBeDefined()
  })

  it('exécute directement une action sans confirmation (submitForReview) et relaie le nouveau statut', async () => {
    const onTransitioned = vi.fn()
    vi.mocked(browserSdk.SubmitForReview).mockResolvedValue({
      data: { submitForReview: { id: 'a1', status: 'REVIEW', currentVersion: 2, publishedAt: null, scheduledAt: null, updatedAt: 'now' } },
    } as never)

    renderBar('DRAFT', onTransitioned)
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre pour relecture' }))

    await waitFor(() => expect(onTransitioned).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REVIEW' }),
    ))
  })

  it("désactive le bouton AVANT tout clic quand myRole n'atteint pas le rôle minimum, avec sa raison affichée — sans jamais appeler la mutation", () => {
    renderBar('REVIEW', vi.fn(), 'AUTHOR')
    const button = screen.getByRole('button', { name: 'Approuver' })
    // REVIEW propose aussi « Rejeter », qui exige le même rôle EDITOR : la
    // raison affichée est donc dupliquée sur la page, `within` restreint la
    // recherche au groupe du bouton « Approuver ».
    const group = button.parentElement as HTMLElement

    expect(button.hasAttribute('disabled')).toBe(true)
    expect(within(group).getByText('Rôle EDITOR requis pour cette action (rôle actuel : AUTHOR)')).toBeDefined()

    fireEvent.click(button)
    expect(browserSdk.ApproveArticle).not.toHaveBeenCalled()
  })

  it('avec un rôle suffisant, le bouton reste actif : seul un refus effectif du backend le désactive (défense en profondeur, ex. rôle rétrogradé entre le rendu et le clic)', async () => {
    vi.mocked(browserSdk.ApproveArticle).mockRejectedValue({
      response: {
        errors: [{ message: 'Rôle EDITOR requis pour la transition REVIEW → APPROVED (rôle actuel : AUTHOR)', extensions: { code: 'FORBIDDEN' } }],
      },
    })

    renderBar('REVIEW', vi.fn(), 'EDITOR')
    const button = screen.getByRole('button', { name: 'Approuver' })
    expect(button.hasAttribute('disabled')).toBe(false)

    fireEvent.click(button)

    await waitFor(() =>
      expect(screen.getByText('Rôle EDITOR requis pour la transition REVIEW → APPROVED (rôle actuel : AUTHOR)')).toBeDefined(),
    )
    expect(screen.getByRole('button', { name: 'Approuver' }).hasAttribute('disabled')).toBe(true)
  })

  it('ouvre un ConfirmDialog pour une action destructive (rejeter) avant de muter', async () => {
    vi.mocked(browserSdk.RejectArticle).mockResolvedValue({
      data: { rejectArticle: { id: 'a1', status: 'DRAFT', currentVersion: 2, publishedAt: null, scheduledAt: null, updatedAt: 'now' } },
    } as never)

    renderBar('REVIEW')
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter (renvoyer en brouillon)' }))
    // La mutation n'est pas encore appelée tant que la confirmation n'a pas eu lieu.
    expect(browserSdk.RejectArticle).not.toHaveBeenCalled()
    expect(screen.getByText('Rejeter cet article ?')).toBeDefined()

    // Le bouton du déclencheur original et celui du ConfirmDialog partagent le
    // même libellé (`confirmLabel` reprend `def.label`) : le second (dans la
    // boîte de dialogue) est celui qui confirme réellement l'action.
    // Radix marque le reste de la page `aria-hidden` tant que la boîte de
    // dialogue est ouverte (piège de focus, accessibilité) : le déclencheur
    // d'origine n'est donc plus interrogeable par rôle, seul le bouton de
    // confirmation de la boîte de dialogue l'est.
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter (renvoyer en brouillon)' }))

    await waitFor(() => expect(browserSdk.RejectArticle).toHaveBeenCalledTimes(1))
  })

  it('refuse de programmer une date passée, sans appeler la mutation', () => {
    renderBar('APPROVED')
    fireEvent.click(screen.getByRole('button', { name: 'Programmer la publication' }))

    const input = screen.getByLabelText('Date et heure de publication') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2000-01-01T00:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programmer' }))

    expect(screen.getByText('La date de programmation doit être dans le futur.')).toBeDefined()
    expect(browserSdk.ScheduleArticle).not.toHaveBeenCalled()
  })

  it('programme une date future en ISO 8601', async () => {
    vi.mocked(browserSdk.ScheduleArticle).mockResolvedValue({
      data: { scheduleArticle: { id: 'a1', status: 'SCHEDULED', currentVersion: 2, publishedAt: null, scheduledAt: '2099-01-01T00:00:00.000Z', updatedAt: 'now' } },
    } as never)

    renderBar('APPROVED')
    fireEvent.click(screen.getByRole('button', { name: 'Programmer la publication' }))
    fireEvent.change(screen.getByLabelText('Date et heure de publication'), { target: { value: '2099-01-01T00:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programmer' }))

    await waitFor(() => expect(browserSdk.ScheduleArticle).toHaveBeenCalledWith(
      expect.objectContaining({ domainId: 'd1', id: 'a1' }),
    ))
  })
})
