import Link from 'next/link'
import { cookies } from 'next/headers'
import type { TopicStatus } from '@cancerweb/graphql'
import { serverSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DomainPicker } from '@/components/dashboard/domain-picker'
import { DomainSwitcher } from '@/components/dashboard/domain-switcher'
import { cn } from '@/lib/cn'
import { TopicsTable } from './topics-table'

export const metadata = { title: 'Idées — cancerWeb' }

const PAGE_SIZE = 20

const STATUS_FILTERS: Array<{ value: TopicStatus | undefined; label: string }> = [
  { value: undefined, label: 'Tous' },
  { value: 'IDEA', label: 'Idées' },
  { value: 'SELECTED', label: 'Sélectionnés' },
  { value: 'REJECTED', label: 'Rejetés' },
  { value: 'CONVERTED', label: 'Convertis' },
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export default async function TopicsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const cookieHeader = (await cookies()).toString()
  const sdk = serverSdk(cookieHeader)

  const { data: domainsData } = await sdk.Domains({ page: { limit: 100, offset: 0 } })
  const domains = domainsData.domains.items

  if (domains.length === 0) {
    return (
      <EmptyState
        title="Aucun domaine éditorial"
        description="Créez un domaine avant de gérer ses idées d’articles."
        action={
          <Link href="/dashboard/domains/new">
            <Button>Créer un domaine</Button>
          </Link>
        }
      />
    )
  }

  const domainId = firstParam(params.domainId)
  if (!domainId || !domains.some((domain) => domain.id === domainId)) {
    return <DomainPicker domains={domains} basePath="/dashboard/topics" />
  }

  const status = firstParam(params.status) as TopicStatus | undefined
  const page = Math.max(1, Number(firstParam(params.page)) || 1)

  const { data } = await sdk.Topics({
    domainId,
    status,
    page: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
  })

  const emptyState = status ? (
    <EmptyState
      title="Aucune idée pour ce filtre"
      description="Aucun sujet ne correspond à ce statut pour ce domaine."
      action={
        <Link href={`/dashboard/topics?domainId=${domainId}`}>
          <Button variant="secondary">Effacer le filtre</Button>
        </Link>
      }
    />
  ) : (
    <EmptyState
      title="Aucune idée"
      description="Les idées d’articles apparaissent ici, qu’elles soient saisies à la main ou générées par l’IA."
      action={
        <Link href={`/dashboard/topics/new?domainId=${domainId}`}>
          <Button>Nouvelle idée</Button>
        </Link>
      }
    />
  )

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Idées d’articles</h1>
        <div className="flex items-center gap-3">
          <DomainSwitcher domains={domains} currentDomainId={domainId} basePath="/dashboard/topics" />
          <Link href={`/dashboard/topics/generate?domainId=${domainId}`}>
            <Button variant="secondary">Générer des idées</Button>
          </Link>
          <Link href={`/dashboard/topics/new?domainId=${domainId}`}>
            <Button>Nouvelle idée</Button>
          </Link>
        </div>
      </div>

      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ value, label }) => {
          const href = value
            ? `/dashboard/topics?domainId=${domainId}&status=${value}`
            : `/dashboard/topics?domainId=${domainId}`
          const active = status === value
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <TopicsTable
        domainId={domainId}
        topics={data.topics.items}
        totalCount={data.topics.totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        emptyState={emptyState}
      />
    </section>
  )
}
