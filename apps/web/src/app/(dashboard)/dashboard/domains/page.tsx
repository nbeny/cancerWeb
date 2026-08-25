import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Domaines — cancerWeb' }

export default async function DomainsPage() {
  const cookieStore = await cookies()
  const { data } = await serverSdk(cookieStore.toString()).Domains({ page: { limit: 50, offset: 0 } })

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Domaines éditoriaux</h1>
        <Link href="/dashboard/domains/new"><Button>Nouveau domaine</Button></Link>
      </div>

      {data.domains.items.length === 0 ? (
        <EmptyState
          title="Aucun domaine"
          description="Créez votre premier domaine éditorial pour définir le sujet, le ton et l’audience de vos contenus."
          action={<Link href="/dashboard/domains/new"><Button>Créer un domaine</Button></Link>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.domains.items.map((domain) => (
            <li key={domain.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-medium text-slate-900">{domain.name}</h2>
              <p className="mt-1 text-sm text-slate-500">/{domain.slug} · {domain.language.toUpperCase()}</p>
              {domain.description && <p className="mt-2 text-sm text-slate-600">{domain.description}</p>}
              <p className="mt-3 text-xs text-slate-400">
                Publication automatique : {domain.autoPublish ? 'activée' : 'désactivée'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
