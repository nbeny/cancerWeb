import { GraphQLClient } from 'graphql-request'
import { getSdk } from '@cancerweb/graphql'

const INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/graphql'

/** SDK côté navigateur : passe par le proxy same-origin, les cookies suivent automatiquement. */
export const browserSdk = getSdk(
  new GraphQLClient('/graphql', { credentials: 'include' }),
)

/** SDK côté serveur (Server Components, Route Handlers) : le cookie doit être relayé à la main. */
export function serverSdk(cookieHeader: string | undefined) {
  return getSdk(
    new GraphQLClient(INTERNAL_URL, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    }),
  )
}
