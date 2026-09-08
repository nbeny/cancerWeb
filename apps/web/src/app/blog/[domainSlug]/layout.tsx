import type { ReactNode } from 'react'

/**
 * Coquille des pages publiques. Personne ne visite `/blog/<slug>`
 * directement : `proxy.ts` y réécrit les requêtes portant un sous-domaine.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
}
