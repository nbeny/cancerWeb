import { GraphQLClient } from 'graphql-request'
import { getSdk } from '@cancerweb/graphql'

const INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/graphql'

// graphql-request@7 construit toujours `new URL(params.url)` avant d'émettre la requête
// (y compris pour un POST, voir GraphQLClient.rawRequest -> createFetcher dans
// node_modules/graphql-request/build/entrypoints/main.cjs), même si `fetch` accepte
// nativement une URL relative. Une chaîne relative comme '/graphql' fait donc échouer
// `new URL()` avec `TypeError: Failed to construct 'URL': Invalid URL` — vérifié dans un
// vrai navigateur (Chromium via Playwright) : silencieusement rattrapé par le try/catch
// des formulaires, qui affichait un message d'erreur générique sans jamais atteindre le
// réseau. Ce module est aussi importé côté serveur (via `serverSdk`), où `window` est
// indéfini : on ne peut donc pas résoudre l'origine à l'import. On calcule l'URL absolue
// paresseusement, uniquement quand `window` existe (donc uniquement quand `browserSdk`
// sera réellement utilisé, depuis un composant client après hydratation).
const browserGraphqlUrl = () =>
  typeof window === 'undefined' ? '/graphql' : `${window.location.origin}/graphql`

/** SDK côté navigateur : passe par le proxy same-origin, les cookies suivent automatiquement. */
export const browserSdk = getSdk(
  new GraphQLClient(browserGraphqlUrl(), { credentials: 'include' }),
)

/** SDK côté serveur (Server Components, Route Handlers) : le cookie doit être relayé à la main. */
export function serverSdk(cookieHeader: string | undefined) {
  return getSdk(
    new GraphQLClient(INTERNAL_URL, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    }),
  )
}
