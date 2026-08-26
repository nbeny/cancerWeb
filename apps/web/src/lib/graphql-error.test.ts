import { graphqlErrorCode } from './graphql-error'

describe('graphqlErrorCode', () => {
  it('lit le code sous extensions.code (norme GraphQL, formatError API)', () => {
    const error = { response: { errors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }] } }
    expect(graphqlErrorCode(error)).toBe('UNAUTHENTICATED')
  })

  it('retombe sur .code à la racine si extensions est absent (compat)', () => {
    const error = { response: { errors: [{ message: 'x', code: 'FORBIDDEN' }] } }
    expect(graphqlErrorCode(error)).toBe('FORBIDDEN')
  })

  it('préfère extensions.code quand les deux sont présents', () => {
    const error = { response: { errors: [{ message: 'x', code: 'OLD', extensions: { code: 'NEW' } }] } }
    expect(graphqlErrorCode(error)).toBe('NEW')
  })

  it('renvoie undefined pour une erreur sans structure GraphQL', () => {
    expect(graphqlErrorCode(new Error('boom'))).toBeUndefined()
    expect(graphqlErrorCode(undefined)).toBeUndefined()
  })
})
