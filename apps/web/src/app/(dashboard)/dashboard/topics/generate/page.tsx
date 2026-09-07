import Link from 'next/link'
import { GenerateTopicsForm } from '@/components/dashboard/generate-topics-form'
import { ErrorState } from '@/components/ui/error-state'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Générer des idées — cancerWeb' }

interface PageProps {
  searchParams: Promise<{ domainId?: string }>
}

export default async function GenerateTopicsPage({ searchParams }: PageProps) {
  const { domainId } = await searchParams

  if (!domainId) {
    return (
      <ErrorState
        title="Domaine manquant"
        message="Choisissez d’abord un domaine depuis la liste des idées."
        action={
          <Link href="/dashboard/topics">
            <Button variant="secondary">Retour aux idées</Button>
          </Link>
        }
      />
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Générer des idées avec l’IA</h1>
      <p className="max-w-2xl text-sm text-slate-600">
        L’IA propose de nouveaux sujets d’articles pour ce domaine. La génération est suivie comme les autres
        générations IA, dans « Jobs IA ».
      </p>
      <GenerateTopicsForm domainId={domainId} />
    </section>
  )
}
