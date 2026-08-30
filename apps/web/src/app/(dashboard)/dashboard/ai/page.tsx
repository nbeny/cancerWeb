import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DomainPicker } from '@/components/dashboard/domain-picker'
import { DomainSwitcher } from '@/components/dashboard/domain-switcher'
import { QueueList } from './queue-list'
import { HistoryTable } from './history-table'

export const metadata = { title: 'Jobs IA — cancerWeb' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * File d'attente + historique des générations IA (Task 7). `pipelineQueue`
 * porte les runs actifs (position, estimation) ; `pipelineRuns` porte
 * l'historique — les runs déjà présents dans la file en sont exclus plutôt
 * que dupliqués dans les deux sections (voir `historyRuns` ci-dessous).
 */
export default async function AiPage({ searchParams }: PageProps) {
  const params = await searchParams
  const cookieHeader = (await cookies()).toString()
  const sdk = serverSdk(cookieHeader)

  const { data: domainsData } = await sdk.Domains({ page: { limit: 100, offset: 0 } })
  const domains = domainsData.domains.items

  if (domains.length === 0) {
    return (
      <EmptyState
        title="Aucun domaine éditorial"
        description="Créez un domaine avant de suivre ses générations IA."
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
    return <DomainPicker domains={domains} basePath="/dashboard/ai" />
  }

  const page = Math.max(1, Number(firstParam(params.page)) || 1)

  const [{ data: queueData }, { data: runsData }] = await Promise.all([
    sdk.PipelineQueue({ domainId }),
    sdk.PipelineRuns({ domainId, page: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
  ])

  const queue = queueData.pipelineQueue
  const activeIds = new Set(queue.map((entry) => entry.run.id))
  const historyRuns = runsData.pipelineRuns.items.filter((run) => !activeIds.has(run.id))
  const historyTotalCount = Math.max(0, runsData.pipelineRuns.totalCount - queue.length)

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Jobs IA</h1>
        <div className="flex items-center gap-3">
          <DomainSwitcher domains={domains} currentDomainId={domainId} basePath="/dashboard/ai" />
          <Link href={`/dashboard/topics/generate?domainId=${domainId}`}>
            <Button>Générer des idées</Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-900">File d’attente</h2>
        <QueueList domainId={domainId} queue={queue} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-900">Historique</h2>
        <HistoryTable
          domainId={domainId}
          runs={historyRuns}
          totalCount={historyTotalCount}
          page={page}
          pageSize={PAGE_SIZE}
          emptyState={
            <EmptyState
              title="Aucune génération terminée"
              description="Les générations d’articles ou d’idées terminées, échouées ou annulées apparaîtront ici."
            />
          }
        />
      </div>
    </section>
  )
}
