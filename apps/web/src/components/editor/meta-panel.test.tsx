import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { MetaPanel, type MetaFieldsValue } from './meta-panel'

const BASE_VALUES: MetaFieldsValue = {
  seoTitle: 'Un titre de test',
  metaDescription: 'Une description',
  focusKeyword: 'cancer',
  secondaryKeywords: ['a', 'b'],
  canonicalUrl: '',
  robotsIndex: true,
  robotsFollow: true,
}

describe('MetaPanel', () => {
  it('affiche le slug en lecture seule (non modifiable côté API)', () => {
    render(
      <MetaPanel
        slug="mon-article"
        values={BASE_VALUES}
        onChange={vi.fn()}
        metrics={null}
        metricsStale={false}
        categories={[]}
        categoryId={null}
        onCategoryChange={vi.fn()}
        allTags={[]}
        selectedTagIds={[]}
        onTagsChange={vi.fn()}
      />,
    )
    const slugInput = screen.getByDisplayValue('mon-article') as HTMLInputElement
    expect(slugInput.readOnly).toBe(true)
  })

  it('affiche un tiret quand les métriques ne sont pas encore disponibles', () => {
    render(
      <MetaPanel
        slug="s"
        values={BASE_VALUES}
        onChange={vi.fn()}
        metrics={null}
        metricsStale={false}
        categories={[]}
        categoryId={null}
        onCategoryChange={vi.fn()}
        allTags={[]}
        selectedTagIds={[]}
        onTagsChange={vi.fn()}
      />,
    )
    expect(screen.getByText('—/60 caractères (30–60 recommandé)')).toBeDefined()
  })

  it('utilise metrics.seoTitleLength — jamais un recomptage local — pour le compteur du titre SEO', () => {
    render(
      <MetaPanel
        slug="s"
        // Valeur locale volontairement différente de la métrique pour prouver
        // que le compteur affiché vient de `metrics`, pas de `values.seoTitle.length`.
        values={{ ...BASE_VALUES, seoTitle: 'x' }}
        onChange={vi.fn()}
        metrics={{ seoTitleLength: 45 }}
        metricsStale={false}
        categories={[]}
        categoryId={null}
        onCategoryChange={vi.fn()}
        allTags={[]}
        selectedTagIds={[]}
        onTagsChange={vi.fn()}
      />,
    )
    expect(screen.getByText('45/60 caractères (30–60 recommandé)')).toBeDefined()
  })

  it('affiche le compteur de la meta description avec les seuils 120–158', () => {
    render(
      <MetaPanel
        slug="s"
        values={BASE_VALUES}
        onChange={vi.fn()}
        metrics={{ metaDescriptionLength: 140 }}
        metricsStale={false}
        categories={[]}
        categoryId={null}
        onCategoryChange={vi.fn()}
        allTags={[]}
        selectedTagIds={[]}
        onTagsChange={vi.fn()}
      />,
    )
    expect(screen.getByText('140/158 caractères (120–158 recommandé)')).toBeDefined()
  })

  it('convertit la saisie des mots-clés secondaires en tableau, en ignorant les vides', () => {
    const onChange = vi.fn()
    render(
      <MetaPanel
        slug="s"
        values={BASE_VALUES}
        onChange={onChange}
        metrics={null}
        metricsStale={false}
        categories={[]}
        categoryId={null}
        onCategoryChange={vi.fn()}
        allTags={[]}
        selectedTagIds={[]}
        onTagsChange={vi.fn()}
      />,
    )
    const input = screen.getByDisplayValue('a, b')
    fireEvent.change(input, { target: { value: 'x, y,  , z' } })
    expect(onChange).toHaveBeenCalledWith({ secondaryKeywords: ['x', 'y', 'z'] })
  })

  it('bascule un tag sélectionné au clic', () => {
    const onTagsChange = vi.fn()
    render(
      <MetaPanel
        slug="s"
        values={BASE_VALUES}
        onChange={vi.fn()}
        metrics={null}
        metricsStale={false}
        categories={[]}
        categoryId={null}
        onCategoryChange={vi.fn()}
        allTags={[{ id: 't1', name: 'Chimio' }]}
        selectedTagIds={[]}
        onTagsChange={onTagsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chimio' }))
    expect(onTagsChange).toHaveBeenCalledWith(['t1'])
  })

  it('appelle onCategoryChange(null) pour « Aucune »', () => {
    const onCategoryChange = vi.fn()
    render(
      <MetaPanel
        slug="s"
        values={BASE_VALUES}
        onChange={vi.fn()}
        metrics={null}
        metricsStale={false}
        categories={[{ id: 'c1', name: 'Oncologie' }]}
        categoryId="c1"
        onCategoryChange={onCategoryChange}
        allTags={[]}
        selectedTagIds={[]}
        onTagsChange={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('Oncologie'), { target: { value: '' } })
    expect(onCategoryChange).toHaveBeenCalledWith(null)
  })
})
