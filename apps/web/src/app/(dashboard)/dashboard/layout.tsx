import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { serverSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs'
import { ToastProvider } from '@/components/ui/toast'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const header = cookieStore.toString()

  let userName: string
  try {
    const { data } = await serverSdk(header).Me()
    userName = data.me.name
  } catch (error) {
    // Seul un code UNAUTHENTICATED signifie réellement « pas connecté » (ou
    // session expirée) : c'est le seul cas où rediriger silencieusement vers
    // /auth/login est correct. Toute autre panne (API arrêtée, timeout,
    // erreur de schéma...) doit remonter à error.tsx : éjecter l'utilisateur
    // vers le login masquerait un incident réel derrière un écran de
    // connexion trompeur.
    if (graphqlErrorCode(error) === 'UNAUTHENTICATED') {
      redirect('/auth/login')
    }
    throw error
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-slate-50">
        {/* `Sidebar` lit `useSearchParams()` (pour reporter `?domainId=...` sur
            ses propres liens, voir sa jsdoc) : Next.js recommande un
            `<Suspense>` autour de tout Client Component qui l'utilise, pour
            ne rendre CE sous-arbre côté client sans bloquer le reste — voir
            `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`. */}
        <Suspense fallback={<div className="h-full w-60 border-r border-slate-200 bg-white" />}>
          <Sidebar />
        </Suspense>
        <div className="flex flex-1 flex-col">
          <Header userName={userName} />
          <Breadcrumbs />
          <main className="flex-1 px-6 pb-10">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
