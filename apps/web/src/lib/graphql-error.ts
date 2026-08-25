/**
 * `graphql-request` (mode rawRequest) lève un `ClientError` (sous-classe de `Error`)
 * dès qu'une réponse GraphQL contient `errors`, même en HTTP 200 — voir
 * `GraphQLClient.rawRequest` dans graphql-request/build/legacy/classes/GraphQLClient.js :
 * `if (response instanceof Error) throw response`. Le `ClientError` expose
 * `.response.errors[].extensions.code` (et `.code` en miroir côté API), ce qui permet
 * de distinguer les codes d'erreur stables exposés par l'API.
 */
interface GraphQLErrorLike {
  message?: string
  code?: string
  extensions?: { code?: string }
}

interface ClientErrorLike {
  response?: { errors?: GraphQLErrorLike[] }
}

export function graphqlErrorCode(error: unknown): string | undefined {
  const errors = (error as ClientErrorLike | undefined)?.response?.errors
  const first = errors?.[0]
  return first?.extensions?.code ?? first?.code
}
