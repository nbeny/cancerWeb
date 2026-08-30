import Link from 'next/link'
import { TopicForm } from '@/components/dashboard/topic-form'
import { ErrorState } from '@/components/ui/error-state'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Nouvelle idée — cancerWeb' }

interface PageProps {
  searchParams: Promise<{ domainId?: string }>
}

export default async function NewTopicPage({ searchParams }: PageProps) {
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
      <h1 className="text-xl font-semibold text-slate-900">Nouvelle idée d’article</h1>
      <TopicForm domainId={domainId} />
    </section>
  )
}
