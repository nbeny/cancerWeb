import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, registerSchema } from '@cancerweb/validation'
import { RegisterInput } from './auth.types'

// Ce test attrape une régression concrète : si les décorateurs class-validator
// de RegisterInput (API) et le schéma zod `registerSchema` (@cancerweb/validation,
// front) se remettaient à porter des bornes différentes — par exemple si
// quelqu'un remplaçait `@MinLength(PASSWORD_MIN_LENGTH)` par un littéral codé en
// dur — les deux systèmes accepteraient/rejetteraient des valeurs différentes
// aux limites, et les assertions ci-dessous échoueraient.

function toRegisterInput(payload: Record<string, unknown>): RegisterInput {
  return plainToInstance(RegisterInput, payload)
}

describe('RegisterInput reste aligné avec registerSchema (@cancerweb/validation)', () => {
  const basePayload = {
    email: 'test@example.com',
    name: 'Ana',
    password: 'x'.repeat(PASSWORD_MIN_LENGTH),
  }

  it('accepte un mot de passe exactement à la borne minimale partagée', async () => {
    expect(registerSchema.safeParse(basePayload).success).toBe(true)

    const errors = await validate(toRegisterInput(basePayload))
    expect(errors.some((e) => e.property === 'password')).toBe(false)
  })

  it('rejette un mot de passe un caractère sous la borne minimale partagée', async () => {
    const tooShort = { ...basePayload, password: 'x'.repeat(PASSWORD_MIN_LENGTH - 1) }

    expect(registerSchema.safeParse(tooShort).success).toBe(false)

    const errors = await validate(toRegisterInput(tooShort))
    expect(errors.some((e) => e.property === 'password')).toBe(true)
  })

  it('accepte un nom exactement à la borne maximale partagée', async () => {
    const maxName = { ...basePayload, name: 'a'.repeat(NAME_MAX_LENGTH) }

    expect(registerSchema.safeParse(maxName).success).toBe(true)

    const errors = await validate(toRegisterInput(maxName))
    expect(errors.some((e) => e.property === 'name')).toBe(false)
  })

  it('rejette un nom un caractère au-dessus de la borne maximale partagée', async () => {
    const tooLong = { ...basePayload, name: 'a'.repeat(NAME_MAX_LENGTH + 1) }

    expect(registerSchema.safeParse(tooLong).success).toBe(false)

    const errors = await validate(toRegisterInput(tooLong))
    expect(errors.some((e) => e.property === 'name')).toBe(true)
  })
})
