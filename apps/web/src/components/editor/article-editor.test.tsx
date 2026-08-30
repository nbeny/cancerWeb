import { render, screen, act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { ArticleEditorFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { ToastProvider } from '@/components/ui/toast'
import { ArticleEditor } from './article-editor'

vi.mock('@/lib/graphql-client', () => ({
  browserSdk: {
    UpdateArticle: vi.fn(),
    AnalyzeSeo: vi.fn(),
    SetArticleCategory: vi.fn(),
    SetArticleTags: vi.fn(),
  },
}))

// `article-editor.tsx` charge `MarkdownEditor` via `next/dynamic(..., { ssr:
// false })` (voir sa jsdoc) : le vrai CodeMirror n'apporte rien à ces tests
// (qui portent sur la sauvegarde temporisée, pas sur la coloration
// syntaxique) et alourdirait sérieusement chaque test sous jsdom. Ce
// remplacement minimal expose la même interface `value`/`onChange` — le
// champ « Titre » (un simple `<input>`) suffit de toute façon à exercer le
// même chemin de sauvegarde temporisée que le contenu Markdown, les deux
// passant par `updateField()`.
vi.mock('./markdown-editor', () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Contenu Markdown de l’article" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

function article(overrides: Partial<ArticleEditorFieldsFragment> = {}): ArticleEditorFieldsFragment {
  return {
    id: 'a1',
    domainId: 'd1',
    title: 'Titre initial',
    slug: 'titre-initial',
    status: 'DRAFT',
    content: '# Contenu',
    renderedHtml: '<h1>Contenu</h1>',
    excerpt: null,
    coverImageUrl: null,
    seoTitle: null,
    metaDescription: null,
    focusKeyword: null,
    secondaryKeywords: [],
    canonicalUrl: null,
    robotsIndex: true,
    robotsFollow: true,
    latestSeoScore: 80,
    currentVersion: 1,
    wordCount: 2,
    topicId: null,
    publishedAt: null,
    scheduledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    author: { id: 'u1', name: 'Alice' },
    category: null,
    tags: [],
    ...overrides,
  }
}

const REPORT = {
  id: 'r1',
  articleId: 'a1',
  score: 80,
  computedAt: '2026-01-01T00:00:00.000Z',
  metrics: {},
  issues: [],
}

function renderEditor(overrides: Partial<ArticleEditorFieldsFragment> = {}) {
  return render(
    <ToastProvider>
      <ArticleEditor domainId="d1" article={article(overrides)} categories={[]} allTags={[]} initialSeoReport={REPORT} />
    </ToastProvider>,
  )
}

describe('ArticleEditor — sauvegarde temporisée', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("n'appelle pas UpdateArticle avant l'écoulement du délai de temporisation", async () => {
    vi.mocked(browserSdk.UpdateArticle).mockResolvedValue({ data: { updateArticle: article() } } as never)
    renderEditor()

    fireEvent.change(screen.getByLabelText('Titre de l’article'), { target: { value: 'Titre initial!' } })
    expect(browserSdk.UpdateArticle).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400)
    })
    expect(browserSdk.UpdateArticle).not.toHaveBeenCalled()
  })

  it("n'envoie qu'UN SEUL appel pour plusieurs frappes rapprochées (debounce, pas d'appel à chaque frappe)", async () => {
    vi.mocked(browserSdk.UpdateArticle).mockResolvedValue({ data: { updateArticle: article() } } as never)
    vi.mocked(browserSdk.AnalyzeSeo).mockResolvedValue({ data: { analyzeSeo: REPORT } } as never)
    renderEditor()

    const input = screen.getByLabelText('Titre de l’article')
    // Cinq « frappes » espacées de 400ms, sous le délai de 1500ms : un
    // composant naïf qui appellerait l'API à chaque frappe enverrait 5
    // requêtes. La temporisation ne doit en envoyer qu'UNE, 1500ms après la
    // DERNIÈRE frappe.
    for (const value of ['T', 'Ti', 'Tit', 'Titr', 'Titre!']) {
      fireEvent.change(input, { target: { value } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
    }
    expect(browserSdk.UpdateArticle).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(browserSdk.UpdateArticle).toHaveBeenCalledTimes(1)
  })

  it('affiche les transitions « non enregistrées » → « enregistrement » → « enregistré »', async () => {
    let resolveUpdate!: (value: { data: { updateArticle: ArticleEditorFieldsFragment } }) => void
    vi.mocked(browserSdk.UpdateArticle).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve
      }) as never,
    )
    vi.mocked(browserSdk.AnalyzeSeo).mockResolvedValue({ data: { analyzeSeo: REPORT } } as never)
    renderEditor()

    expect(screen.getByText('Enregistré')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Titre de l’article'), { target: { value: 'Titre initial!' } })
    expect(screen.getByText('Modifications non enregistrées')).toBeDefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(screen.getByText('Enregistrement…')).toBeDefined()

    await act(async () => {
      resolveUpdate({ data: { updateArticle: article({ title: 'Titre initial!' }) } })
      // Deux passages de micro-tâches : un pour la résolution de la promesse
      // `UpdateArticle`, un pour l'appel (fire-and-forget) à `runAnalyze()`
      // déclenché juste après — `waitFor` ne peut pas être utilisé ici : ses
      // sondages reposent sur `setTimeout`, gelé par `vi.useFakeTimers()`.
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Enregistré')).toBeDefined()
  })

  it("en cas d'échec, affiche « Échec de l'enregistrement » SANS perdre le texte saisi, et Réessayer relance la sauvegarde", async () => {
    vi.mocked(browserSdk.UpdateArticle)
      .mockRejectedValueOnce({ response: { errors: [{ message: 'Le serveur ne répond pas' }] } })
      .mockResolvedValueOnce({ data: { updateArticle: article({ title: 'Titre initial modifié' }) } } as never)
    vi.mocked(browserSdk.AnalyzeSeo).mockResolvedValue({ data: { analyzeSeo: REPORT } } as never)
    renderEditor()

    const titleInput = screen.getByLabelText('Titre de l’article') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'Titre initial modifié' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(screen.getByText('Échec de l’enregistrement')).toBeDefined()
    expect(screen.getByText('Le serveur ne répond pas')).toBeDefined()
    // Le texte saisi par l'utilisateur reste intact — jamais écrasé par l'échec.
    expect(titleInput.value).toBe('Titre initial modifié')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Enregistré')).toBeDefined()
    expect(browserSdk.UpdateArticle).toHaveBeenCalledTimes(2)
  })
})
