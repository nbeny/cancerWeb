import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { chargerArticle } from './article-cache'
import { metadonneesArticle } from './article-metadata'
import { ArticleView } from './article-view'

interface PageProps {
  params: Promise<{ domainSlug: string; articleSlug: string }>
}

/**
 * Charge l'article ou rend un 404.
 *
 * L'API répond `NOT_FOUND` de façon indifférenciée pour un slug inconnu, un
 * article non publié, un article appartenant à un autre domaine, ou un domaine
 * sans aucun article publié (voir `apps/api/src/public/public.service.ts`).
 * Cette indifférenciation est délibérée côté API — la distinguer ici
 * révélerait au visiteur l'existence de brouillons — et se traduit donc par un
 * unique `notFound()`.
 *
 * Toute AUTRE panne (API arrêtée, timeout, erreur de schéma) est relancée :
 * un 404 mentirait au visiteur ET aux moteurs de recherche, qui désindexent un
 * article introuvable. La convention est la même que sur les pages du tableau
 * de bord, qui laissent remonter tout ce qui n'est pas un `NOT_FOUND` explicite.
 *
 * `chargerArticle` est mémorisée par requête (voir `article-cache.ts`) : cette
 * fonction est appelée deux fois par rendu, une pour les métadonnées et une
 * pour la page, sans provoquer deux allers-retours réseau.
 */
async function articleOuNotFound(domainSlug: string, articleSlug: string): Promise<PublicArticleFieldsFragment> {
  try {
    return await chargerArticle(domainSlug, articleSlug)
  } catch (error) {
    if (graphqlErrorCode(error) === 'NOT_FOUND') notFound()
    throw error
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domainSlug, articleSlug } = await params
  return metadonneesArticle(await articleOuNotFound(domainSlug, articleSlug))
}

/**
 * Page d'un article public.
 *
 * Personne ne visite `/blog/<domainSlug>/<articleSlug>` : `proxy.ts` y réécrit
 * les requêtes portant un sous-domaine, et l'URL vue par le lecteur reste
 * `cybersecurite.example.com/mon-article`. Ce préfixe est donc interne au
 * routage et ne doit JAMAIS apparaître dans un lien — depuis un hôte à
 * sous-domaine, la réécriture s'appliquerait une seconde fois et produirait
 * `/blog/<slug>/blog/<slug>/…`, qui n'existe pas. D'où l'absence de tout
 * `<Link>` construit à partir de `domainSlug` dans cette page.
 *
 * Aucune conversion Markdown ici : `renderedHtml` est calculé et sanitizé à
 * l'écriture, côté API.
 */
export default async function ArticlePubliePage({ params }: PageProps) {
  const { domainSlug, articleSlug } = await params
  return <ArticleView article={await articleOuNotFound(domainSlug, articleSlug)} />
}
