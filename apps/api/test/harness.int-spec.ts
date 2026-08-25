import { createHarness, Harness } from './app-harness'

let h: Harness
beforeAll(async () => {
  h = await createHarness()
})
afterAll(async () => {
  await h.close()
})

describe('harnais d’intégration', () => {
  it('cible bien la base de test et non la base de développement', () => {
    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.DATABASE_URL).toContain('cancerweb_test')
    expect(process.env.DATABASE_URL).toContain('5434')
  })

  it('accède au schéma migré', async () => {
    await expect(h.prisma.user.count()).resolves.toEqual(expect.any(Number))
    await expect(h.prisma.domain.count()).resolves.toEqual(expect.any(Number))
  })

  it('truncateAll vide réellement les tables', async () => {
    const user = await h.prisma.user.create({
      data: {
        email: 'harness@example.com',
        name: 'Harness',
        slug: 'harness',
        passwordHash: 'peu-importe',
      },
    })
    expect(await h.prisma.user.count()).toBe(1)

    await h.reset()
    expect(await h.prisma.user.count()).toBe(0)
    expect(user.id).toEqual(expect.any(String))
  })
})
