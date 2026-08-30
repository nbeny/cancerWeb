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

/**
 * Le message GraphQL brut renvoyé par l'API (voir `AllExceptionsFilter` côté
 * serveur). Utile aux côtés de `graphqlErrorCode` : le code `FORBIDDEN` seul
 * ne distingue pas « cette transition n'existe pas » de « ton rôle ne
 * l'autorise pas » — les deux cas partagent le même code, seul le message
 * les distingue (voir `apps/api/src/articles/transitions.ts`). Ce message est
 * déjà rédigé pour un humain (français, sans fuite de données sensibles) :
 * on l'affiche tel quel plutôt que de le re-décomposer par une regex fragile.
 */
export function graphqlErrorMessage(error: unknown): string | undefined {
  const errors = (error as ClientErrorLike | undefined)?.response?.errors
  return errors?.[0]?.message
}
