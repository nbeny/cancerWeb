/**
 * Traduit un en-tête `Host` en `Domain.slug`, ou `null` quand la requête vise
 * le back-office plutôt qu'un blog.
 *
 * La règle est volontairement stricte — exactement UN label devant le domaine
 * racine — plutôt que « tout ce qui précède le dernier point ». Un slug est
 * une clé de recherche en base : accepter `a.b.localhost` reviendrait à
 * chercher un domaine nommé `a` sur une requête qui ne le désignait pas, ou
 * pire, à faire dépendre le blog servi d'un préfixe que n'importe qui peut
 * fabriquer. Ce qui n'est pas explicitement reconnu retombe sur le
 * back-office, jamais sur un blog choisi par défaut.
 *
 * `rootHost` est injecté plutôt que lu depuis l'environnement ici : cette
 * fonction reste pure et testable, l'appelant (`proxy.ts`) porte la
 * configuration.
 */
export function domainSlugFromHost(host: string | null | undefined, rootHost: string): string | null {
  if (!host) return null

  // `Host` peut porter le port ; la comparaison se fait sur le seul nom.
  const hostname = host.split(':')[0]?.toLowerCase().trim()
  if (!hostname) return null

  const root = rootHost.split(':')[0]?.toLowerCase().trim()
  if (!root || hostname === root) return null

  const suffix = `.${root}`
  if (!hostname.endsWith(suffix)) return null

  const slug = hostname.slice(0, -suffix.length)
  // Un seul label : `a.b.localhost` n'est pas un blog (voir la jsdoc).
  if (!slug || slug.includes('.')) return null

  return slug
}
