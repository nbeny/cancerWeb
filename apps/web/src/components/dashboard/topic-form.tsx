'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createTopicSchema, type CreateTopicValues } from '@cancerweb/validation'
import { browserSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

export function TopicForm({ domainId }: { domainId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<CreateTopicValues>({
    resolver: zodResolver(createTopicSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await browserSdk.CreateTopic({
        domainId,
        input: {
          title: values.title,
          description: values.description || undefined,
          suggestedAngle: values.suggestedAngle || undefined,
          estimatedDifficulty: values.estimatedDifficulty ? Number(values.estimatedDifficulty) : undefined,
          estimatedInterest: values.estimatedInterest ? Number(values.estimatedInterest) : undefined,
        },
      })
      router.push(`/dashboard/topics?domainId=${domainId}`)
      router.refresh()
    } catch {
      setError('La création a échoué. Vérifiez les champs saisis et réessayez.')
    }
  })

  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      {error && <ErrorState title="Création impossible" message={error} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Titre</span>
        <input {...register('title')} placeholder="Les nouveaux traitements ciblés en 2026" className={field} />
        {formState.errors.title && <span className="text-xs text-red-600">{formState.errors.title.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Description</span>
        <textarea {...register('description')} rows={3} className={field} />
        {formState.errors.description && (
          <span className="text-xs text-red-600">{formState.errors.description.message}</span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Angle suggéré</span>
        <textarea {...register('suggestedAngle')} rows={3} className={field} />
        {formState.errors.suggestedAngle && (
          <span className="text-xs text-red-600">{formState.errors.suggestedAngle.message}</span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Difficulté estimée (1-10)</span>
          <input type="number" min={1} max={10} {...register('estimatedDifficulty')} className={field} />
          {formState.errors.estimatedDifficulty && (
            <span className="text-xs text-red-600">{formState.errors.estimatedDifficulty.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Intérêt estimé (1-10)</span>
          <input type="number" min={1} max={10} {...register('estimatedInterest')} className={field} />
          {formState.errors.estimatedInterest && (
            <span className="text-xs text-red-600">{formState.errors.estimatedInterest.message}</span>
          )}
        </label>
      </div>

      <Button type="submit" loading={formState.isSubmitting} className="self-start">
        Créer l’idée
      </Button>
    </form>
  )
}
