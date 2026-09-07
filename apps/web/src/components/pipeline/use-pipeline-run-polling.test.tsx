import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import type { PipelineRunFieldsFragment } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { usePipelineRunPolling } from './use-pipeline-run-polling'

vi.mock('@/lib/graphql-client', () => ({
  browserSdk: { PipelineRun: vi.fn() },
}))

function run(overrides: Partial<PipelineRunFieldsFragment> = {}): PipelineRunFieldsFragment {
  return {
    id: 'run-1',
    domainId: 'd1',
    topicId: null,
    articleId: 'a1',
    triggeredBy: 'u1',
    status: 'RUNNING',
    currentStep: 'OUTLINE',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

describe('usePipelineRunPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("n'interroge pas le serveur si le run initial est déjà terminé", async () => {
    renderHook(() => usePipelineRunPolling('d1', run({ status: 'COMPLETED' })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(browserSdk.PipelineRun).not.toHaveBeenCalled()
  })

  it('interroge pipelineRun toutes les 2 secondes tant que le run reste actif', async () => {
    vi.mocked(browserSdk.PipelineRun).mockResolvedValue({ data: { pipelineRun: run() } } as never)

    renderHook(() => usePipelineRunPolling('d1', run()))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(browserSdk.PipelineRun).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(browserSdk.PipelineRun).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(browserSdk.PipelineRun).toHaveBeenCalledTimes(3)
  })

  it("arrête le polling dès que le run devient terminé — pas d'appel supplémentaire même après avoir avancé le temps", async () => {
    vi.mocked(browserSdk.PipelineRun)
      .mockResolvedValueOnce({ data: { pipelineRun: run({ status: 'RUNNING' }) } } as never)
      .mockResolvedValueOnce({ data: { pipelineRun: run({ status: 'COMPLETED', completedAt: '2026-01-01T00:05:00.000Z' }) } } as never)

    const { result } = renderHook(() => usePipelineRunPolling('d1', run()))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000) // 1er poll : toujours RUNNING
    })
    expect(browserSdk.PipelineRun).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000) // 2e poll : devient COMPLETED
    })
    expect(browserSdk.PipelineRun).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('COMPLETED')

    // Le défaut classique : un polling qui continue indéfiniment sur un run
    // terminé. On avance largement le temps (5 tours de plus) et on vérifie
    // qu'AUCUN appel supplémentaire n'a eu lieu.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(browserSdk.PipelineRun).toHaveBeenCalledTimes(2)
  })
})
