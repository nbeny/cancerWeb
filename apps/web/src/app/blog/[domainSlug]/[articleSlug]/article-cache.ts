import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'
import { serverSdk } from '@/lib/graphql-client'
import { PLANCHER_REVALIDATION_S } from '../blog-cache'

/**
 * Étiquette de cache d'UN article public, à passer à `revalidateTag` pour
 * republier la page après une modification côté back-office (Tâche 7 : webhook
 * de revalidation).
 *
 * Exportée plutôt que reconstruite à la main dans le webhook : le format de
 * cette chaîne est un contrat entre deux modules qui ne se lisent pas l'un
 * l'autre. Une faute de frappe dans une chaîne dupliquée ne produirait aucune
 * erreur — juste un article figé sur sa version précédente, indéfiniment, sans
 * le moindre signal.
 *
 * Le domaine fait partie de l'étiquette parce que le slug seul ne désigne rien :
 * la contrainte d'unicité côté base est `@@unique([domainId, slug])` (voir
 * `apps/api/prisma/schema.prisma`), deux blogs peuvent donc publier deux
 * articles différents sous le même slug.
 */
export function etiquetteArticle(domainSlug: string, slug: string): string {
  return `article-public:${domainSlug}:${slug}`
}

/**
 * Charge un article public, en le mémorisant dans le cache incrémental de
 * Next.js jusqu'à invalidation explicite via `etiquetteArticle`.
 *
 * Pourquoi `unstable_cache` et pas simplement l'appel direct au SDK : le lot
 * vise des pages statiques régénérées à la demande. Or `serverSdk` interroge
 * l'API en POST via `graphql-request`, et Next.js ne met JAMAIS en cache une
 * requête `fetch` POST — la page serait donc re-rendue à chaque visite, et le
 * webhook de la Tâche 7 n'aurait rien à invalider. `unstable_cache` est
 * l'échappatoire documentée pour les sources de données que `fetch` ne sait
 * pas mettre en cache (voir `next/dist/docs/01-app/02-guides/
 * caching-without-cache-components.md`, section « unstable_cache for
 * non-fetch functions »).
 *
 * `unstable_cache` plutôt que la directive `use cache` qui la remplace en
 * Next 16 : cette dernière exige le drapeau `cacheComponents` dans
 * `next.config.ts`, un basculement qui change le modèle de cache de TOUTE
 * l'application (y compris le tableau de bord authentifié) — hors du périmètre
 * de cette page.
 *
 * Portée volontairement locale : aucun `export const dynamic` n'est posé sur
 * la route. Forcer le rendu statique au niveau du segment s'appliquerait aussi
 * au `layout.tsx` parent — dont `cookies()` et `headers()` renverraient alors
 * silencieusement des valeurs vides. On ne met en cache que CETTE lecture,
 * sans rien imposer aux segments voisins.
 *
 * Enveloppée dans `cache()` de React par-dessus : `generateMetadata` et le
 * composant de page demandent le même article pendant le même rendu, et la
 * mémorisation par requête évite le second aller-retour quand l'entrée de
 * cache est froide (les deux appels manqueraient sinon le cache en parallèle).
 *
 * `serverSdk(undefined)` : aucun en-tête `cookie` n'est transmis. C'est
 * délibéré — la page est publique, et une réponse mise en cache pour tous ne
 * doit surtout pas avoir été calculée avec la session d'un visiteur.
 *
 * Lève l'erreur du SDK telle quelle (notamment `NOT_FOUND`) : les rejets ne
 * sont pas mis en cache, l'appelant décide quoi en faire.
 */
export const chargerArticle = cache(async function chargerArticle(
  domainSlug: string,
  slug: string,
): Promise<PublicArticleFieldsFragment> {
  const lecture = unstable_cache(
    async () => {
      const { data } = await serverSdk(undefined).PublicArticle({ domainSlug, slug })
      return data.publicArticle
    },
    // Clé de cache. `unstable_cache` n'y intègre pas les variables capturées
    // par la closure (seulement les arguments de la fonction mémorisée, ici
    // aucun) : sans ces deux parties, tous les articles partageraient la même
    // entrée et le premier chargé serait servi à la place de tous les autres.
    ['article-public', domainSlug, slug],
    // `revalidate` : filet de sécurité en cas de webhook manqué, identique
    // aux deux autres chargeurs — voir la jsdoc de `PLANCHER_REVALIDATION_S`.
    { tags: [etiquetteArticle(domainSlug, slug)], revalidate: PLANCHER_REVALIDATION_S },
  )
  return lecture()
})
