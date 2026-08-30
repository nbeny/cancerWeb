import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { vi } from 'vitest'
import { browserSdk } from '@/lib/graphql-client'
import { ToastProvider } from '@/components/ui/toast'
import { VersionPanel } from './version-panel'

vi.mock('@/lib/graphql-client', () => ({
  browserSdk: {
    ArticleVersions: vi.fn(),
    RestoreArticleVersion: vi.fn(),
  },
}))

const AUTHOR = { id: 'u1', name: 'Alice' }

function versions() {
  return [
    { id: 'v2', version: 2, title: 'T', content: 'ligne 1\nligne modifiée', changeNote: null, createdAt: '2026-01-02T00:00:00.000Z', createdById: 'u1' },
    { id: 'v1', version: 1, title: 'T', content: 'ligne 1\nligne originale', changeNote: 'submit', createdAt: '2026-01-01T00:00:00.000Z', createdById: 'u2' },
  ]
}

describe('VersionPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('liste les versions avec repli sur l’auteur de l’article ou un identifiant tronqué', async () => {
    vi.mocked(browserSdk.ArticleVersions).mockResolvedValue({ data: { articleVersions: versions() } } as never)
    render(
      <ToastProvider>
        <VersionPanel domainId="d1" articleId="a1" currentAuthor={AUTHOR} onRestored={vi.fn()} />
      </ToastProvider>,
    )

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    // createdById 'u1' correspond à l'auteur connu de l'article -> son nom.
    expect(screen.getByText(/Alice/)).toBeDefined()
    // createdById 'u2' ne correspond à personne de connu -> identifiant tronqué, pas un nom inventé.
    expect(screen.getByText(/Utilisateur u2/)).toBeDefined()
  })

  it('affiche un diff ligne à ligne entre les deux versions les plus récentes par défaut', async () => {
    vi.mocked(browserSdk.ArticleVersions).mockResolvedValue({ data: { articleVersions: versions() } } as never)
    render(
      <ToastProvider>
        <VersionPanel domainId="d1" articleId="a1" currentAuthor={AUTHOR} onRestored={vi.fn()} />
      </ToastProvider>,
    )

    await waitFor(() => expect(screen.getByText(/ligne modifiée/)).toBeDefined())
    expect(screen.getByText(/ligne originale/)).toBeDefined()
  })

  it('restaure une version derrière un ConfirmDialog qui explique la création d’une nouvelle version', async () => {
    vi.mocked(browserSdk.ArticleVersions).mockResolvedValue({ data: { articleVersions: versions() } } as never)
    const onRestored = vi.fn()
    render(
      <ToastProvider>
        <VersionPanel domainId="d1" articleId="a1" currentAuthor={AUTHOR} onRestored={onRestored} />
      </ToastProvider>,
    )
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restaurer' })).toHaveLength(2))

    fireEvent.click(screen.getAllByRole('button', { name: 'Restaurer' })[1]) // v1
    expect(screen.getByText(/NOUVELLE version/)).toBeDefined()
    expect(browserSdk.RestoreArticleVersion).not.toHaveBeenCalled()

    const restoredArticle = { id: 'a1', domainId: 'd1' } as never
    vi.mocked(browserSdk.RestoreArticleVersion).mockResolvedValue({ data: { restoreArticleVersion: restoredArticle } } as never)
    vi.mocked(browserSdk.ArticleVersions).mockResolvedValue({ data: { articleVersions: versions() } } as never)

    // Comme pour `TransitionBar` : Radix rend le reste de la page
    // `aria-hidden` pendant que la boîte de dialogue est ouverte, donc les
    // boutons "Restaurer" de la liste ne sont plus interrogeables — seul
    // celui de la boîte de dialogue l'est.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(browserSdk.RestoreArticleVersion).toHaveBeenCalledWith({ domainId: 'd1', articleId: 'a1', version: 1 })
    expect(onRestored).toHaveBeenCalledWith(restoredArticle)
  })
})
