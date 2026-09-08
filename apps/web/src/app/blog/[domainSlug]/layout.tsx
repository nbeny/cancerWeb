import Link from 'next/link'
import type { ReactNode } from 'react'
import { domaineOuNotFound } from './blog-cache'

/**
 * Coquille des pages publiques : l'en-tête du blog, commun à l'accueil, aux
 * pages de pagination et aux pages d'article. Personne ne visite
 * `/blog/<slug>` directement — `proxy.ts` y réécrit les requêtes portant un
 * sous-domaine, et l'URL vue par le lecteur reste `<slug>.<hôte-racine>/`.
 * C'est pourquoi le lien de l'en-tête pointe sur `/` et non sur
 * `/blog/<slug>` : depuis un hôte à sous-domaine, la réécriture s'appliquerait
 * une seconde fois.
 *
 * Le nom du domaine n'est délibérément pas un `<h1>` : il coiffe toutes les
 * pages du blog, y compris celle d'un article dont le titre est le vrai
 * niveau 1. C'est un bandeau, pas le titre de la page courante.
 *
 * Ce layout enveloppant CHAQUE page du blog, sa lecture de l'API détermine à
 * elle seule si l'arbre entier peut rester statique — d'où la mémorisation par
 * `unstable_cache` dans `blog-cache.ts`, et non un appel direct au SDK.
 */
export default async function BlogLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ domainSlug: string }>
}) {
  const { domainSlug } = await params
  const domaine = await domaineOuNotFound(domainSlug)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 border-b border-slate-200 pb-6">
        <Link href="/" className="text-2xl font-semibold text-slate-900 transition-colors hover:text-slate-600">
          {domaine.name}
        </Link>
        {domaine.description && <p className="mt-2 text-sm text-slate-600">{domaine.description}</p>}
      </header>
      <main>{children}</main>
    </div>
  )
}
