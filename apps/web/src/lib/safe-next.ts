export const FALLBACK_NEXT = '/dashboard'

/**
 * Neutralise les redirections ouvertes sur un paramètre `next` fourni par le client.
 *
 * Le contrôle se fait en résolvant l'URL puis en comparant les origines, et NON
 * par inspection de préfixe. Une vérification du type
 * `startsWith('/') && !startsWith('//')` est contournable : le parseur d'URL
 * WHATWG normalise l'antislash en slash, donc `/\evil.example` franchit le
 * filtre puis se résout en `http://evil.example/`. Vérifié empiriquement.
 *
 * Ne renvoie que `pathname + search` : même quand l'origine correspond, aucune
 * origine absolue n'est propagée dans la redirection.
 */
export function safeNext(next: string | null, base: string): string {
  if (!next) return FALLBACK_NEXT
  try {
    const resolved = new URL(next, base)
    if (resolved.origin !== new URL(base).origin) return FALLBACK_NEXT
    return resolved.pathname + resolved.search
  } catch {
    return FALLBACK_NEXT
  }
}
