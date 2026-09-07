'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { generateTopicsSchema, GENERATE_TOPICS_COUNT_MAX, GENERATE_TOPICS_COUNT_MIN, type GenerateTopicsValues } from '@cancerweb/validation'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { useToast } from '@/components/ui/toast'

/**
 * Déclenche `generateTopics` (Task 6) puis redirige vers le suivi
 * (`/dashboard/ai/[id]`, Task 7) — jamais vers la liste des idées : les
 * sujets n'existent pas encore tant que le pipeline n'a pas tourné.
 */
export function GenerateTopicsForm({ domainId }: { domainId: string }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<GenerateTopicsValues>({
    resolver: zodResolver(generateTopicsSchema),
    defaultValues: { count: '5' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const { data } = await browserSdk.GenerateTopics({ domainId, input: { count: Number(values.count) } })
      showToast({ title: 'Génération de sujets lancée', variant: 'success' })
      router.push(`/dashboard/ai/${data.generateTopics.id}?domainId=${domainId}`)
    } catch (err) {
      setError(graphqlErrorMessage(err) ?? 'Le lancement de la génération a échoué. Réessayez.')
    }
  })

  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      {error && <ErrorState title="Génération impossible" message={error} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">
          Nombre de sujets ({GENERATE_TOPICS_COUNT_MIN}–{GENERATE_TOPICS_COUNT_MAX})
        </span>
        <input
          type="number"
          min={GENERATE_TOPICS_COUNT_MIN}
          max={GENERATE_TOPICS_COUNT_MAX}
          {...register('count')}
          className={field}
        />
        {formState.errors.count && <span className="text-xs text-red-600">{formState.errors.count.message}</span>}
      </label>

      <Button type="submit" loading={formState.isSubmitting} className="self-start">
        Générer avec l’IA
      </Button>
    </form>
  )
}
