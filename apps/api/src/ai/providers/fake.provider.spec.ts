import { FakeAIProvider } from './fake.provider'

const ENV_KEYS = ['AI_FAKE_LATENCY_MS', 'AI_FAKE_FAIL_STEP', 'AI_FAKE_INVALID_OUTLINE'] as const

function clearFakeEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key]
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

describe('FakeAIProvider', () => {
  let provider: FakeAIProvider

  beforeEach(() => {
    clearFakeEnv()
    provider = new FakeAIProvider()
  })

  afterEach(() => {
    clearFakeEnv()
  })

  it("expose la clé 'fake'", () => {
    expect(provider.key).toBe('fake')
  })

  it('health() est toujours ok, sans dépendance externe', async () => {
    await expect(provider.health()).resolves.toEqual({ ok: true })
  })

  it('renvoie un plan Markdown valide (un H1, plusieurs H2) pour [[OUTLINE]]', async () => {
    const result = await provider.complete({ prompt: 'Rédige un plan. [[OUTLINE]]' })
    const h1Count = (result.text.match(/^# .+$/gm) ?? []).length
    const h2Count = (result.text.match(/^## .+$/gm) ?? []).length
    expect(h1Count).toBe(1)
    expect(h2Count).toBeGreaterThanOrEqual(2)
  })

  it('renvoie un brouillon Markdown plausible d\'au moins 300 mots pour [[DRAFT]]', async () => {
    const result = await provider.complete({ prompt: 'Rédige un brouillon. [[DRAFT]]' })
    expect(countWords(result.text)).toBeGreaterThanOrEqual(300)
  })

  it('renvoie une fixture pour [[TOPICS]]', async () => {
    const result = await provider.complete({ prompt: 'Propose des sujets. [[TOPICS]]' })
    expect(result.text.trim().length).toBeGreaterThan(0)
  })

  it('un marqueur inconnu échoue explicitement plutôt que de renvoyer une fixture par défaut', async () => {
    await expect(provider.complete({ prompt: 'Un prompt sans marqueur reconnu.' })).rejects.toThrow(
      /marqueur/i,
    )
  })

  it('deux appels identiques renvoient exactement le même texte (déterminisme)', async () => {
    const req = { prompt: 'Rédige un plan. [[OUTLINE]]' }
    const first = await provider.complete(req)
    const second = await provider.complete(req)
    expect(second.text).toBe(first.text)
  })

  it('respecte AI_FAKE_LATENCY_MS', async () => {
    process.env.AI_FAKE_LATENCY_MS = '80'
    const start = Date.now()
    const result = await provider.complete({ prompt: '[[TOPICS]]' })
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(75)
    expect(result.durationMs).toBeGreaterThanOrEqual(75)
  })

  it("AI_FAKE_FAIL_STEP=DRAFT fait échouer uniquement l'étape DRAFT", async () => {
    process.env.AI_FAKE_FAIL_STEP = 'DRAFT'
    await expect(provider.complete({ prompt: '[[DRAFT]]' })).rejects.toThrow(/DRAFT/)
    await expect(provider.complete({ prompt: '[[OUTLINE]]' })).resolves.toBeDefined()
  })

  it('AI_FAKE_INVALID_OUTLINE=1 renvoie un plan invalide avec deux H1', async () => {
    process.env.AI_FAKE_INVALID_OUTLINE = '1'
    const result = await provider.complete({ prompt: '[[OUTLINE]]' })
    const h1Count = (result.text.match(/^# .+$/gm) ?? []).length
    expect(h1Count).toBe(2)
  })
})
