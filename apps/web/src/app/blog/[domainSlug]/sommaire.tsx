import Link from 'next/link'
import { notFound } from 'next/navigation'
import { chargerSommaire, type PageDeSommaire } from './blog-cache'
import { graphqlErrorCode } from '@/lib/graphql-error'

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Lien vers une page du sommaire, dans l'espace d'URL DU LECTEUR.
 *
 * Le préfixe `/blog/<domainSlug>` appartient à la réécriture de `proxy.ts` et
 * ne doit jamais apparaître dans un lien : depuis un hôte à sous-domaine, la
 * réécriture s'appliquerait une seconde fois et produirait
 * `/blog/<slug>/blog/<slug>/…`, qui n'existe pas.
 *
 * La page 1 est `/` et jamais `/page/1` : une seule URL canonique pour
 * l'accueil, plutôt que deux pages identiques offertes à l'indexation.
 */
function lienVersPage(numero: number): string {
  return numero <= 1 ? '/' : `/page/${numero}`
}

/**
 * Le sommaire demandé, ou un 404 rendu.
 *
 * Deux cas de 404, distincts :
 *
 * - `NOT_FOUND` de l'API — slug inconnu, ou domaine sans aucun article publié.
 *   L'API ne renvoie pas une liste vide, elle refuse (voir `public.service.ts`).
 * - une page au-delà du dernier article, elle légitimement vide. Sans ce
 *   second cas, `/page/999` serait une coquille indexable, et un robot en
 *   parcourrait une infinité.
 *
 * `notFound()` est appelé ici, hors de `unstable_cache` (voir `blog-cache.ts`).
 */
async function sommaireOuNotFound(domainSlug: string, page: number): Promise<PageDeSommaire> {
  let sommaire: PageDeSommaire
  try {
    sommaire = await chargerSommaire(domainSlug, page)
  } catch (error) {
    if (graphqlErrorCode(error) === 'NOT_FOUND') notFound()
    throw error
  }

  if (sommaire.items.length === 0) notFound()
  return sommaire
}

/**
 * Liste des articles publiés d'un blog, du plus récent au plus ancien.
 *
 * Partagée par les deux routes du sommaire : l'accueil (`page.tsx`, page 1) et
 * la pagination (`page/[numero]/page.tsx`, pages 2 et suivantes). Cette
 * séparation en deux routes est ce qui permet à l'accueil de ne lire aucun
 * `searchParams` et de rester statique, donc revalidable par la Tâche 7.
 */
export async function Sommaire({ domainSlug, page }: { domainSlug: string; page: number }) {
  const { items, totalPages } = await sommaireOuNotFound(domainSlug, page)

  return (
    <div className="flex flex-col gap-10">
      {/* Le nom du blog est porté par le bandeau du layout ; le niveau 1 de
          CETTE page décrit ce qu'elle liste. Il change au-delà de la première
          page, où « Derniers articles » serait faux. */}
      <h1 className="text-lg font-medium text-slate-900">
        {page === 1 ? 'Derniers articles' : `Articles — page ${page}`}
      </h1>

      <ul className="flex flex-col gap-10">
        {items.map((article) => (
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
                <Link href={`/${article.slug}`} className="transition-colors hover:text-slate-600">
                  {article.title}
                </Link>
              </h2>

              {article.publishedAt && (
                <time dateTime={article.publishedAt} className="text-xs uppercase tracking-wide text-slate-500">
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
