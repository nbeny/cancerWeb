import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import type { PublicArticleFieldsFragment, PublicDomainQuery } from '@cancerweb/graphql'
import { serverSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'

/** Vue publique du domaine servi par ce sous-domaine (voir `PublicDomain` côté API). */
export type DomainePublic = PublicDomainQuery['publicDomain']

/** Nombre d'articles par page du sommaire. */
const TAILLE_PAGE = 10

/**
 * Borne haute du numéro de page accepté.
 *
 * `offset` voyage en `Int!` GraphQL, donc sur 32 bits signés : sans borne,
 * `/page/10000000000` ferait échouer la sérialisation de la requête et
 * remonterait en erreur 500, là où une page hors bornes doit être un 404. La
 * borne reste très au-delà de tout sommaire réel.
 */
export const PAGE_MAX = 100_000

/**
 * Étiquette de cache du domaine public, à passer à `revalidateTag` (Tâche 7 :
 * webhook de revalidation).
 *
 * Exportée plutôt que reconstruite à la main dans le webhook, pour la même
 * raison que `etiquetteArticle` (voir `[articleSlug]/article-cache.ts`) : le
 * format de cette chaîne est un contrat entre deux modules qui ne se lisent
 * pas l'un l'autre, et une faute de frappe dans une chaîne dupliquée ne
 * produirait aucune erreur — juste une page figée, sans le moindre signal.
 */
export function etiquetteDomaine(domainSlug: string): string {
  return `domaine-public:${domainSlug}`
}

/**
 * Étiquette de cache du sommaire d'un blog. Volontairement SANS numéro de
 * page : publier un article décale tous les articles suivants d'une page à
 * l'autre, donc une publication doit invalider le sommaire entier et non la
 * seule page où le nouvel article atterrit.
 */
export function etiquetteSommaire(domainSlug: string): string {
  return `sommaire-public:${domainSlug}`
}

/**
 * Charge le domaine servi par ce sous-domaine, en le mémorisant dans le cache
 * incrémental de Next.js jusqu'à invalidation explicite via `etiquetteDomaine`.
 *
 * Pourquoi `unstable_cache` et pas l'appel direct au SDK : le lot vise des
 * pages statiques régénérées à la demande, or `serverSdk` interroge l'API en
 * POST via `graphql-request`, et Next.js ne met JAMAIS en cache une requête
 * `fetch` POST. Une seule lecture non mémorisée suffit à sortir TOUTE la route
 * du cache de routes — et ce chargeur sert au layout, qui coiffe chaque page
 * du blog, sommaire comme article. C'est donc ici, plus qu'ailleurs, que se
 * décide le caractère statique de l'ensemble. Voir
 * `next/dist/docs/01-app/02-guides/caching-without-cache-components.md`,
 * section « `unstable_cache` for non-`fetch` functions ».
 *
 * `unstable_cache` plutôt que la directive `use cache` qui la remplace en
 * Next 16 : cette dernière exige le drapeau `cacheComponents`, qui change le
 * modèle de cache de TOUTE l'application, tableau de bord authentifié compris.
 * Et aucun `export const dynamic` non plus : la configuration de segment
 * s'applique à la route entière, `force-static` ferait silencieusement
 * renvoyer des valeurs vides à `cookies()` et `headers()` pour tout ce qui
 * rend dans cet arbre. On ne mémorise que CETTE lecture.
 *
 * Enveloppée dans `cache()` de React par-dessus : le layout et le
 * `generateMetadata` des pages demandent le même domaine pendant le même
 * rendu, sans pouvoir se passer la valeur (Next les invoque séparément). Sur
 * une entrée froide, les deux manqueraient le cache en parallèle et feraient
 * deux allers-retours.
 *
 * `serverSdk(undefined)` : aucun en-tête `cookie` n'est transmis. Le blog se
 * lit sans compte, et une réponse mémorisée pour tous ne doit surtout pas
 * avoir été calculée avec la session d'un visiteur.
 *
 * Lève l'erreur du SDK telle quelle : un rejet n'est pas mis en cache, ce qui
 * est exactement ce qu'on veut d'un `NOT_FOUND` — le jour où un domaine publie
 * son premier article, il n'y a aucune entrée négative à purger et le blog
 * s'allume dès la visite suivante.
 */
export const chargerDomainePublic = cache(async function chargerDomainePublic(
  domainSlug: string,
): Promise<DomainePublic> {
  const lecture = unstable_cache(
    async () => {
      const { data } = await serverSdk(undefined).PublicDomain({ slug: domainSlug })
      return data.publicDomain
    },
    // Clé de cache. `unstable_cache` n'y intègre pas les variables capturées
    // par la closure (seulement les arguments de la fonction mémorisée, ici
    // aucun) : sans `domainSlug`, tous les blogs partageraient une entrée et
    // le premier chargé serait servi à la place de tous les autres.
    ['domaine-public', domainSlug],
    { tags: [etiquetteDomaine(domainSlug)] },
  )
  return lecture()
})

/** Une page du sommaire, telle que la consomme la vue. */
export interface PageDeSommaire {
  items: PublicArticleFieldsFragment[]
  totalCount: number
  totalPages: number
}

/**
 * Charge une page du sommaire, mémorisée sous `etiquetteSommaire`.
 *
 * Mêmes raisons que `chargerDomainePublic` d'envelopper la lecture dans
 * `unstable_cache`. L'ordre — du plus récent au plus ancien — vient de l'API
 * (`orderBy: { publishedAt: 'desc' }`), il n'est pas retrié ici.
 */
export const chargerSommaire = cache(async function chargerSommaire(
  domainSlug: string,
  page: number,
): Promise<PageDeSommaire> {
  const lecture = unstable_cache(
    async () => {
      const { data } = await serverSdk(undefined).PublicArticles({
        domainSlug,
        page: { limit: TAILLE_PAGE, offset: (page - 1) * TAILLE_PAGE },
      })
      const { items, totalCount } = data.publicArticles
      return { items, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / TAILLE_PAGE)) }
    },
    // `page` DOIT figurer dans la clé : c'est une variable de closure, que
    // `unstable_cache` ignore. Sans elle, `/page/2` servirait le contenu de
    // l'accueil.
    ['sommaire-public', domainSlug, String(page)],
    { tags: [etiquetteSommaire(domainSlug)] },
  )
  return lecture()
})

/**
 * Le domaine, ou un 404 rendu.
 *
 * Ce garde-fou vit à côté des chargeurs plutôt que dans chaque page parce
 * qu'il a trois appelants — le layout et le `generateMetadata` des deux routes
 * du sommaire. Dupliqué, l'un d'eux finirait par laisser remonter un
 * `NOT_FOUND` en erreur 500.
 *
 * L'API répond `NOT_FOUND` de façon indifférenciée pour un slug inconnu comme
 * pour un domaine réel sans aucun article publié — un espace de travail privé
 * n'est pas un blog vide. Cette indifférenciation est délibérée côté API (voir
 * `apps/api/src/public/public.service.ts`) et se traduit ici par un unique
 * `notFound()`. Toute AUTRE panne est relancée : un 404 mentirait au visiteur
 * ET aux moteurs, qui désindexent une page introuvable.
 *
 * `notFound()` est appelé ICI, hors de `unstable_cache` : l'exception de
 * contrôle de Next ne doit jamais traverser une fonction mémorisée, qui
 * tenterait de la mettre en cache.
 */
export async function domaineOuNotFound(domainSlug: string): Promise<DomainePublic> {
  try {
    return await chargerDomainePublic(domainSlug)
  } catch (error) {
    if (graphqlErrorCode(error) === 'NOT_FOUND') notFound()
    throw error
  }
}
