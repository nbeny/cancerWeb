import type { Metadata } from 'next'
import { domaineOuNotFound } from './blog-cache'
import { Sommaire } from './sommaire'

interface PageProps {
  params: Promise<{ domainSlug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domainSlug } = await params
  const domaine = await domaineOuNotFound(domainSlug)

  return {
    title: domaine.name,
    description: domaine.description ?? undefined,
  }
}

/**
 * Accueil du blog : la première page du sommaire.
 *
 * Personne ne visite `/blog/<domainSlug>` : `proxy.ts` y réécrit les requêtes
 * portant un sous-domaine, et l'URL vue par le lecteur reste
 * `cybersecurite.example.com/`.
 *
 * **Cette page ne lit aucun `searchParams`, et c'est délibéré.** La pagination
 * vit dans un segment de chemin (`page/[numero]`) plutôt que dans un paramètre
 * de requête : lire `searchParams` bascule une route en rendu dynamique (voir
 * `next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, « Using
 * `searchParams` opts your page into dynamic rendering »), ce qui la sortirait
 * du cache de routes et priverait le webhook de la Tâche 7 de tout objet à
 * invalider. L'accueil étant la page la plus demandée d'un blog, c'est la
 * dernière qu'on peut se permettre de recalculer à chaque visite.
 *
 * L'autre moitié de cette garantie est dans `blog-cache.ts` : les deux
 * lectures d'API de cette route passent par `unstable_cache`, sans quoi le
 * `fetch` POST du SDK suffirait à rendre la route dynamique malgré l'absence
 * de `searchParams`.
 */
export default async function BlogAccueilPage({ params }: PageProps) {
  const { domainSlug } = await params
  return <Sommaire domainSlug={domainSlug} page={1} />
}
