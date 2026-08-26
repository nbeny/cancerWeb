/**
 * `/api/auth/refresh` effectue une rotation de refresh token, donc une
 * mutation d'état, alors qu'il répond à un `GET` — c'est une contrainte du
 * flux : `src/proxy.ts` y accède via une redirection HTTP, et une
 * redirection ne peut jamais transporter un `POST`. Sous `SameSite=Lax`
 * (voir auth/cookies.ts côté API), les cookies sont malgré tout envoyés
 * lors d'une navigation cross-site de premier niveau : un site tiers peut
 * donc déclencher une rotation depuis un simple lien ou une balise, et un
 * préchargeur/crawler peut faire de même.
 *
 * On s'appuie sur l'en-tête `Sec-Fetch-Site` (Fetch Metadata), posé
 * automatiquement par les navigateurs modernes et non falsifiable par une
 * page tierce, pour n'honorer que les navigations qui proviennent bien de
 * ce site.
 */
export function isTrustedFetchSite(secFetchSite: string | null): boolean {
  if (secFetchSite === null) {
    // Absent chez les navigateurs anciens (pré Fetch Metadata) et chez les
    // clients non-navigateurs (curl, sondes de supervision...). Cette route
    // n'a aucun usage légitime en dehors d'une navigation déclenchée par
    // `proxy.ts` ou par un lien interne : on refuse par défaut (fail
    // closed) plutôt que d'accepter, ce qui rouvrirait exactement la faille
    // corrigée ici pour quiconque omet l'en-tête. Le coût — un navigateur
    // antique ou un script qui perd le rafraîchissement silencieux — est
    // acceptable : l'utilisateur retombe simplement sur l'écran de login.
    return false
  }
  return secFetchSite === 'same-origin' || secFetchSite === 'same-site'
}
