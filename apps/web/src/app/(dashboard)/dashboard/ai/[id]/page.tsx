import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { RunTracker } from '@/components/pipeline/run-tracker'

export const metadata = { title: 'Suivi de génération — cancerWeb' }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ domainId?: string }>
}

export default async function PipelineRunPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { domainId } = await searchParams

  // Même convention que `/dashboard/articles/[id]` : le domaine vit dans
  // l'URL, jamais deviné depuis le run lui-même avant de l'avoir chargé.
  if (!domainId) {
    return (
      <ErrorState
        title="Domaine manquant"
        message="Ouvrez ce suivi depuis la liste des jobs IA pour conserver le contexte du domaine."
        action={
          <Link href="/dashboard/ai">
            <Button variant="secondary">Retour aux jobs IA</Button>
          </Link>
        }
      />
    )
  }

  const cookieHeader = (await cookies()).toString()
  const sdk = serverSdk(cookieHeader)

  let run
  try {
    const { data } = await sdk.PipelineRun({ domainId, id })
    run = data.pipelineRun
  } catch (error) {
    if (graphqlErrorCode(error) === 'NOT_FOUND') {
      return (
        <ErrorState
          title="Génération introuvable"
          message="Ce suivi n’existe pas dans ce domaine, ou vous n’y avez pas accès."
          action={
            <Link href={`/dashboard/ai?domainId=${domainId}`}>
              <Button variant="secondary">Retour aux jobs IA</Button>
            </Link>
          }
        />
      )
    }
    throw error
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Suivi de génération</h1>
        <Link href={`/dashboard/ai?domainId=${domainId}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Retour aux jobs IA
        </Link>
      </div>
      <RunTracker domainId={domainId} run={run} />
    </section>
  )
}
