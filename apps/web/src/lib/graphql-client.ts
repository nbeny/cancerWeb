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
// une fois, au chargement du module — pas paresseusement à l'appel. Ça
// fonctionne uniquement parce que Next.js construit deux bundles distincts
// (serveur et navigateur) : ce module est réévalué séparément dans chacun,
// donc `typeof window` reflète bien l'environnement au moment où CE bundle
// charge le module, y compris pour l'instance de `browserSdk` construite
// ci-dessous au chargement. Sans cette séparation de bundles, ce calcul au
// niveau module figerait la mauvaise valeur.
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
