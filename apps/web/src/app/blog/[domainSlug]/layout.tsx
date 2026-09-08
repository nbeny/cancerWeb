import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache, type ReactNode } from 'react'
import type { PublicDomainQuery } from '@cancerweb/graphql'
import { serverSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'

/** Vue publique du domaine servi par ce sous-domaine (voir `PublicDomain` côté API). */
export type DomainePublic = PublicDomainQuery['publicDomain']

/**
 * Charge le domaine servi par ce sous-domaine, ou `null` quand il n'y en a
 * aucun de visible publiquement.
 *
 * `serverSdk(undefined)` — et non `serverSdk((await cookies()).toString())`
 * comme partout dans le back-office : le blog se lit sans compte, et un
 * cookie relayé ici n'apporterait rien qu'un risque. Les résolveurs
 * `@Public()` filtrent en dur sur `PUBLISHED`, ils ne consultent jamais
 * l'appelant ; envoyer une session ne changerait pas la réponse mais ferait
 * dépendre une page publique de l'identité du visiteur, donc du cache.
 *
 * `null` plutôt qu'un `notFound()` levé ici : ce chargeur sert aussi à
 * `generateMetadata` (voir `page.tsx`), où interrompre le rendu pour décider
 * du routage serait un effet de bord déplacé. Chaque appelant tranche.
 *
 * Le `NOT_FOUND` couvre deux cas volontairement indiscernables côté API
 * (`apps/api/src/public/public.service.ts`) : slug inconnu, et domaine réel
 * mais sans aucun article publié — un espace de travail privé n'est pas un
 * blog vide. Toute autre panne (API injoignable, timeout) remonte : ce n'est
 * pas une absence de contenu, ne pas la déguiser en une.
 *
 * `cache()` de React mémoïse l'appel pour la durée d'UN rendu : le layout et
 * le `generateMetadata` de la page demandent tous deux le même domaine, sans
 * pouvoir se passer la valeur (Next les invoque séparément). Sans cette
 * mémoïsation, chaque affichage coûterait deux fois la même requête.
 */
export const chargerDomainePublic = cache(async (slug: string): Promise<DomainePublic | null> => {
  try {
    const { data } = await serverSdk(undefined).PublicDomain({ slug })
    return data.publicDomain
  } catch (error) {
    if (graphqlErrorCode(error) === 'NOT_FOUND') return null
    throw error
  }
})

/**
 * Coquille des pages publiques : l'en-tête du blog, commun à l'accueil et aux
 * pages d'article. Personne ne visite `/blog/<slug>` directement —
 * `proxy.ts` y réécrit les requêtes portant un sous-domaine, et l'URL vue par
 * le lecteur reste `<slug>.<hôte-racine>/`. C'est pourquoi le lien de
 * l'en-tête pointe sur `/` et non sur `/blog/<slug>`.
 *
 * Le nom du domaine n'est délibérément pas un `<h1>` : il coiffe toutes les
 * pages du blog, y compris celle d'un article dont le titre est le vrai
 * niveau 1. C'est un bandeau, pas le titre de la page courante.
 */
export default async function BlogLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ domainSlug: string }>
}) {
  const { domainSlug } = await params
  const domaine = await chargerDomainePublic(domainSlug)
  if (!domaine) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 border-b border-slate-200 pb-6">
        <Link
          href="/"
          className="text-2xl font-semibold text-slate-900 transition-colors hover:text-slate-600"
        >
          {domaine.name}
        </Link>
        {domaine.description && <p className="mt-2 text-sm text-slate-600">{domaine.description}</p>}
      </header>
      <main>{children}</main>
    </div>
  )
}
