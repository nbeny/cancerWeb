import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Vue d’ensemble — cancerWeb' }

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const { data } = await serverSdk(cookieStore.toString()).Domains({ page: { limit: 5, offset: 0 } })

  if (data.domains.totalCount === 0) {
    return (
      <EmptyState
        title="Aucun domaine éditorial"
        description="Un domaine définit la ligne éditoriale : sujet, ton, audience, langue et consignes données à l’IA. Commencez par en créer un."
        action={<Link href="/dashboard/domains/new"><Button>Créer un domaine</Button></Link>}
      />
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Vue d’ensemble</h1>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-sm text-slate-500">Domaines</dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900">{data.domains.totalCount}</dd>
        </div>
      </dl>
      <p className="text-sm text-slate-500">
        Les compteurs d’articles, d’idées et de jobs IA arrivent avec les lots suivants.
      </p>
    </section>
  )
}
