import { PasswordService } from './password.service'

describe('PasswordService', () => {
  const service = new PasswordService()

  it('produit un hash différent du mot de passe en clair', async () => {
    const hash = await service.hash('correct horse battery staple')
    expect(hash).not.toContain('correct horse')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('produit deux hashes différents pour le même mot de passe (sel aléatoire)', async () => {
    const a = await service.hash('même-mot-de-passe')
    const b = await service.hash('même-mot-de-passe')
    expect(a).not.toBe(b)
  })

  it('vérifie un mot de passe correct', async () => {
    const hash = await service.hash('s3cret-Password!')
    await expect(service.verify(hash, 's3cret-Password!')).resolves.toBe(true)
  })

  it('rejette un mot de passe incorrect', async () => {
    const hash = await service.hash('s3cret-Password!')
    await expect(service.verify(hash, 'mauvais')).resolves.toBe(false)
  })

  it('retourne false sur un hash corrompu au lieu de lever', async () => {
    await expect(service.verify('pas-un-hash', 'peu importe')).resolves.toBe(false)
  })
})
