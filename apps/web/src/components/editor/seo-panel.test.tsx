import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { SeoReportFieldsFragment } from '@cancerweb/graphql'
import { SeoPanel } from './seo-panel'

function report(overrides: Partial<SeoReportFieldsFragment> = {}): SeoReportFieldsFragment {
  return {
    id: 'r1',
    articleId: 'a1',
    score: 82,
    cappedBy: [],
    computedAt: '2026-01-01T00:00:00.000Z',
    metrics: { seoTitleLength: 42 },
    issues: [],
    ...overrides,
  }
}

describe('SeoPanel', () => {
  it('distingue « jamais analysé » d’un score de 0', () => {
    render(
      <SeoPanel report={null} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={vi.fn()} />,
    )
    expect(screen.getByText('Pas encore analysé.')).toBeDefined()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('affiche le score brut sans mention de plafond quand aucune faute bloquante', () => {
    render(
      <SeoPanel report={report({ score: 82 })} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={vi.fn()} />,
    )
    expect(screen.getByText('82')).toBeDefined()
    expect(screen.queryByText(/plafonné/)).toBeNull()
  })

  it('explique le plafonnement à 60 avec le nombre de fautes bloquantes', () => {
    const withBlocking = report({
      score: 60,
      cappedBy: ['META_DESCRIPTION_MISSING'],
      issues: [
        { code: 'META_DESCRIPTION_MISSING', severity: 'BLOCKING', message: 'Meta description absente', field: 'metaDescription' },
      ],
    })
    render(<SeoPanel report={withBlocking} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={vi.fn()} />)
    expect(screen.getByText('Score plafonné à 60 — 1 faute bloquante')).toBeDefined()
  })

  it('accorde au pluriel avec plusieurs fautes bloquantes', () => {
    const withBlocking = report({
      score: 60,
      cappedBy: ['A', 'B'],
      issues: [
        { code: 'A', severity: 'BLOCKING', message: 'x', field: null },
        { code: 'B', severity: 'BLOCKING', message: 'y', field: null },
      ],
    })
    render(<SeoPanel report={withBlocking} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={vi.fn()} />)
    expect(screen.getByText('Score plafonné à 60 — 2 fautes bloquantes')).toBeDefined()
  })

  it('groupe les problèmes par sévérité', () => {
    const withIssues = report({
      issues: [
        { code: 'A', severity: 'BLOCKING', message: 'Bloquant 1', field: null },
        { code: 'B', severity: 'WARNING', message: 'Avertissement 1', field: null },
        { code: 'C', severity: 'INFO', message: 'Info 1', field: null },
      ],
    })
    render(<SeoPanel report={withIssues} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={vi.fn()} />)
    expect(screen.getByText('Bloquant (1)')).toBeDefined()
    expect(screen.getByText('Avertissement (1)')).toBeDefined()
    expect(screen.getByText('Information (1)')).toBeDefined()
  })

  it('un problème avec un champ amène ce champ au clic', () => {
    const onIssueClick = vi.fn()
    const withField = report({
      issues: [{ code: 'TITLE_LENGTH_OUT_OF_RANGE', severity: 'WARNING', message: 'Titre trop court', field: 'seoTitle' }],
    })
    render(<SeoPanel report={withField} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={onIssueClick} />)
    fireEvent.click(screen.getByText('Titre trop court'))
    expect(onIssueClick).toHaveBeenCalledWith('seoTitle')
  })

  it('un problème sans champ n’est pas cliquable', () => {
    const onIssueClick = vi.fn()
    const withoutField = report({
      issues: [{ code: 'READABILITY_LOW', severity: 'WARNING', message: 'Lisibilité faible', field: null }],
    })
    render(<SeoPanel report={withoutField} stale={false} analyzing={false} onAnalyze={vi.fn()} onIssueClick={onIssueClick} />)
    const button = screen.getByText('Lisibilité faible').closest('button')
    expect(button?.hasAttribute('disabled')).toBe(true)
  })

  it('marque le score obsolète visuellement quand stale', () => {
    const { container } = render(
      <SeoPanel report={report()} stale analyzing={false} onAnalyze={vi.fn()} onIssueClick={vi.fn()} />,
    )
    expect(container.querySelector('.opacity-50')).not.toBeNull()
  })

  it('le bouton Analyser déclenche onAnalyze et devient Réanalyser une fois un rapport présent', () => {
    const onAnalyze = vi.fn()
    const { rerender } = render(
      <SeoPanel report={null} stale={false} analyzing={false} onAnalyze={onAnalyze} onIssueClick={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))
    expect(onAnalyze).toHaveBeenCalledTimes(1)

    rerender(<SeoPanel report={report()} stale={false} analyzing={false} onAnalyze={onAnalyze} onIssueClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Réanalyser' })).toBeDefined()
  })
})
