import { Test } from '@nestjs/testing'
import { AiModule, selectAIProvider } from './ai.module'
import { AI_PROVIDER, AIProviderKey } from './ai.types'
import { FakeAIProvider } from './providers/fake.provider'
import { CliAgentProvider } from './providers/cli.provider'

describe('selectAIProvider (fonction pure)', () => {
  const fake = new FakeAIProvider()
  const cli = new CliAgentProvider()

  it("renvoie le FakeAIProvider pour 'fake'", () => {
    expect(selectAIProvider('fake', { fake, cli })).toBe(fake)
  })

  it("renvoie le CliAgentProvider pour 'cli'", () => {
    expect(selectAIProvider('cli', { fake, cli })).toBe(cli)
  })

  it("échoue explicitement pour 'http' (aucune implémentation)", () => {
    expect(() => selectAIProvider('http', { fake, cli })).toThrow(/http/i)
  })

  it('échoue sur une valeur inconnue en listant les valeurs acceptées, jamais un repli sur fake', () => {
    expect(() => selectAIProvider('openai' as AIProviderKey, { fake, cli })).toThrow(/fake, cli, http/)
  })
})

describe('AiModule (câblage Nest)', () => {
  const original = process.env.AI_PROVIDER

  afterEach(() => {
    if (original === undefined) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = original
  })

  it('fournit AI_PROVIDER = FakeAIProvider quand AI_PROVIDER=fake', async () => {
    process.env.AI_PROVIDER = 'fake'
    const moduleRef = await Test.createTestingModule({ imports: [AiModule] }).compile()

    const provider = moduleRef.get(AI_PROVIDER)
    expect(provider).toBeInstanceOf(FakeAIProvider)
  })

  it('fournit AI_PROVIDER = CliAgentProvider quand AI_PROVIDER=cli', async () => {
    process.env.AI_PROVIDER = 'cli'
    const moduleRef = await Test.createTestingModule({ imports: [AiModule] }).compile()

    const provider = moduleRef.get(AI_PROVIDER)
    expect(provider).toBeInstanceOf(CliAgentProvider)
  })

  it('échoue à la compilation du module quand AI_PROVIDER est inconnue', async () => {
    process.env.AI_PROVIDER = 'openai'
    await expect(Test.createTestingModule({ imports: [AiModule] }).compile()).rejects.toThrow(/fake, cli, http/)
  })

  it('échoue à la compilation du module quand AI_PROVIDER est absente', async () => {
    delete process.env.AI_PROVIDER
    await expect(Test.createTestingModule({ imports: [AiModule] }).compile()).rejects.toThrow(/AI_PROVIDER/)
  })
})
