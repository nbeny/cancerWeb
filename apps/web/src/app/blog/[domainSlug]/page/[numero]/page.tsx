import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { PAGE_MAX, domaineOuNotFound } from '../../blog-cache'
import { Sommaire } from '../../sommaire'

interface PageProps {
  params: Promise<{ domainSlug: string; numero: string }>
}

/**
 * Numéro de page lu dans le segment de chemin, ou `null` si ce n'en est pas un.
 *
 * Le motif est volontairement strict — un entier sans zéro initial — parce
 * qu'un segment de chemin n'a pas d'orthographe tolérée : `/page/02`,
 * `/page/2.0`, `/page/+2` et `/page/2e3` ne sont pas des URL que ce blog
 * émet. Les accepter reviendrait à publier plusieurs adresses pour un même
 * contenu, que les moteurs indexeraient comme autant de doublons ; les
 * refuser donne un 404, ce qu'ils sont.
 *
 * Le plafond `PAGE_MAX` protège de l'entier 32 bits de GraphQL (voir
 * `blog-cache.ts`) : `/page/99999999999` passerait le motif, mais son `offset`
 * ferait échouer la requête en erreur 500 au lieu du 404 attendu. Une chaîne
 * de chiffres arbitrairement longue devient `Infinity`, que la comparaison
 * rejette également.
 */
function numeroDePage(segment: string): number | null {
  if (!/^[1-9][0-9]*$/.test(segment)) return null
  const numero = Number(segment)
  return numero <= PAGE_MAX ? numero : null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domainSlug, numero } = await params
  const domaine = await domaineOuNotFound(domainSlug)
  const page = numeroDePage(numero)

  return {
    // Le numéro figure dans le titre : sans lui, toutes les pages du sommaire
    // se présenteraient sous un titre identique, dans un onglet comme dans une
    // page de résultats.
    title: page === null ? domaine.name : `${domaine.name} — page ${page}`,
    description: domaine.description ?? undefined,
  }
}

/**
 * Pages 2 et suivantes du sommaire.
 *
 * Route SÉPARÉE de l'accueil, et non un `?page=` sur celui-ci : voir la
 * justification dans `../../page.tsx`. Comme l'accueil, elle ne lit que
 * `params` — jamais `searchParams`, `cookies()` ni `headers()` — et toutes ses
 * lectures d'API passent par `unstable_cache`. Elle reste donc statique et
 * revalidable par étiquette.
 *
 * Le segment littéral `page` ne réserve PAS le slug `page` sur ce blog :
 * `/page` (trois segments après la racine de l'arbre) est résolu par
 * `[articleSlug]`, tandis que la pagination vit à `/page/<numéro>` (quatre
 * segments). Vérifié en exécutant le trieur et les apparieurs de routes de
 * Next (`getSortedRoutes`, `getRouteMatcher`) sur l'arbre réel, plutôt que
 * supposé. Un article dont le slug serait `page` reste donc accessible.
 */
export default async function BlogPaginationPage({ params }: PageProps) {
  const { domainSlug, numero } = await params
  const page = numeroDePage(numero)
  if (page === null) notFound()

  // `/page/1` n'est pas une seconde adresse de l'accueil. Redirection
  // permanente (308) et non temporaire : cette page ne deviendra jamais
  // distincte de `/`, et seul un code permanent consolide les deux URL aux
  // yeux des moteurs.
  if (page === 1) permanentRedirect('/')

  return <Sommaire domainSlug={domainSlug} page={page} />
}
