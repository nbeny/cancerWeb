import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'
import { serverSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { chargerDomainePublic } from './layout'

const TAILLE_PAGE = 10

/**
 * Borne haute du numéro de page. `offset` voyage en `Int!` GraphQL, donc sur
 * 32 bits signés : `?page=10000000000` ferait échouer la sérialisation de la
 * requête et remonterait en erreur 500, là où une page hors bornes doit être
 * un 404. On plafonne plutôt que de rejeter, et la borne reste bien au-delà
 * de tout sommaire réel : la requête aboutit, ne renvoie aucun article, et le
 * 404 vient de là où il doit venir.
 */
const PAGE_MAX = 100_000

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

interface PageProps {
  params: Promise<{ domainSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Numéro de page lu dans l'URL, ramené à 1 par défaut.
 *
 * Le contrôle est plus strict que le `Math.max(1, Number(x) || 1)` du
 * back-office parce que la valeur vient ici d'un visiteur anonyme, pas d'un
 * lien du tableau de bord : `?page=1e999` y donnerait `Infinity` et
 * `?page=2.5` un `offset` fractionnaire, tous deux envoyés tels quels à
 * l'API. On n'accepte qu'un entier strictement supérieur à 1, plafonné ;
 * tout le reste retombe silencieusement sur la première page, qui est
 * toujours une réponse valide.
 */
function numeroDePage(valeur: string | string[] | undefined): number {
  const brut = typeof valeur === 'string' ? Number(valeur) : Number.NaN
  return Number.isInteger(brut) && brut > 1 ? Math.min(brut, PAGE_MAX) : 1
}

/**
 * Lien vers une page du sommaire. La page 1 n'emporte aucun paramètre : une
 * seule URL canonique pour l'accueil, plutôt que `/` et `/?page=1` indexées
 * comme deux pages identiques.
 */
function lienVersPage(numero: number): string {
  return numero <= 1 ? '/' : `/?page=${numero}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domainSlug } = await params
  const domaine = await chargerDomainePublic(domainSlug)
  // Domaine introuvable : métadonnées vides plutôt qu'une exception. C'est le
  // rendu du layout qui produit le 404 ; faire échouer `generateMetadata`
  // transformerait cette page 404 attendue en erreur 500.
  if (!domaine) return {}

  return {
    title: domaine.name,
    description: domaine.description ?? undefined,
  }
}

/**
 * Sommaire du blog : les articles publiés, du plus récent au plus ancien
 * (l'ordre vient de l'API, `orderBy: { publishedAt: 'desc' }`), paginés.
 *
 * **Pagination par paramètre d'URL** (`?page=2`) plutôt que par segment de
 * chemin : le préfixe `/blog/<slug>` est interne à la réécriture du proxy, et
 * un segment `/page/2` entrerait en concurrence de lecture avec le slug d'un
 * article dans l'esprit du lecteur comme dans l'arbre de routes. Les liens
 * restent de vrais `<a>` rendus côté serveur — donc partageables, indexables
 * et utilisables sans JavaScript, ce qu'un « charger plus » côté client ne
 * serait pas sur un blog dont l'indexation est l'objet même.
 *
 * **Conséquence assumée :** lire `searchParams` bascule cette route en rendu
 * dynamique (voir `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`,
 * « Using `searchParams` opts your page into dynamic rendering »). Le
 * sommaire n'entre donc pas dans le cache de routes : la revalidation à la
 * publication le concernant devient redondante — jamais fausse, puisqu'une
 * page recalculée à chaque requête est toujours à jour. Les pages d'article,
 * elles, restent statiques et revalidables.
 */
export default async function BlogAccueilPage({ params, searchParams }: PageProps) {
  const { domainSlug } = await params
  const page = numeroDePage((await searchParams).page)

  let sommaire: { totalCount: number; items: PublicArticleFieldsFragment[] }
  try {
    const { data } = await serverSdk(undefined).PublicArticles({
      domainSlug,
      page: { limit: TAILLE_PAGE, offset: (page - 1) * TAILLE_PAGE },
    })
    sommaire = data.publicArticles
  } catch (error) {
    // Slug inconnu, ou domaine sans aucun article publié : l'API ne renvoie
    // pas une liste vide, elle lève NOT_FOUND (voir `public.service.ts`). Un
    // blog sans contenu n'existe pas, il ne s'affiche pas vide.
    if (graphqlErrorCode(error) === 'NOT_FOUND') notFound()
    throw error
  }

  // Au-delà du dernier article, l'API renvoie une page légitimement vide.
  // `?page=999` doit être un 404 et non une coquille sans fin : sinon un
  // robot parcourt une infinité d'URL indexables et vides.
  if (sommaire.items.length === 0) notFound()

  const totalPages = Math.max(1, Math.ceil(sommaire.totalCount / TAILLE_PAGE))

  return (
    <div className="flex flex-col gap-10">
      {/* Le nom du blog est porté par le bandeau du layout ; le niveau 1 de
          CETTE page décrit ce qu'elle liste. Il change au-delà de la première
          page : « Derniers articles » y serait faux. */}
      <h1 className="text-lg font-medium text-slate-900">
        {page === 1 ? 'Derniers articles' : `Articles — page ${page}`}
      </h1>

      <ul className="flex flex-col gap-10">
        {sommaire.items.map((article) => (
          <li key={article.id}>
            <article className="flex flex-col gap-2">
              {article.coverImageUrl && (
                // `<img>` et non `next/image` : `coverImageUrl` est une URL
                // arbitraire saisie en back-office, et `next/image` refuse
                // (HTTP 400) tout hôte absent de `images.remotePatterns`.
                // Autoriser des hôtes inconnus dans `next.config.ts` sort du
                // périmètre de ce lot et ouvrirait le proxy d'images à
                // n'importe quelle origine.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.coverImageUrl}
                  alt=""
                  loading="lazy"
                  className="mb-2 aspect-[2/1] w-full rounded-lg bg-slate-100 object-cover"
                />
              )}

              <h2 className="text-xl font-semibold text-slate-900">
                {/* `/<slug>` : l'URL vue par le lecteur. Le préfixe
                    `/blog/<domainSlug>` n'appartient qu'à la réécriture du proxy. */}
                <Link href={`/${article.slug}`} className="transition-colors hover:text-slate-600">
                  {article.title}
                </Link>
              </h2>

              {article.publishedAt && (
                <time
                  dateTime={article.publishedAt}
                  className="text-xs uppercase tracking-wide text-slate-500"
                >
                  {FORMAT_DATE.format(new Date(article.publishedAt))}
                </time>
              )}

              {article.excerpt && <p className="text-sm leading-relaxed text-slate-600">{article.excerpt}</p>}
            </article>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav
          aria-label="Pagination des articles"
          className="flex items-center justify-between gap-4 border-t border-slate-200 pt-6 text-sm"
        >
          {/* Les `<span>` vides tiennent les extrémités : sans eux, le seul
              lien restant glisserait au centre quand on atteint une borne. */}
          {page > 1 ? (
            <Link href={lienVersPage(page - 1)} className="text-slate-700 hover:text-slate-900">
              ← Articles plus récents
            </Link>
          ) : (
            <span />
          )}

          <span className="text-slate-500">
            Page {page} sur {totalPages}
          </span>

          {page < totalPages ? (
            <Link href={lienVersPage(page + 1)} className="text-slate-700 hover:text-slate-900">
              Articles plus anciens →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
