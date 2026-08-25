import { DomainForm } from '@/components/dashboard/domain-form'

export const metadata = { title: 'Nouveau domaine — cancerWeb' }

export default function NewDomainPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Nouveau domaine éditorial</h1>
      <DomainForm />
    </section>
  )
}
