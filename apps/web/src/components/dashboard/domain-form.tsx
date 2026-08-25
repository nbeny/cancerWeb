'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { ExpertiseLevel, Tone } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

interface Values {
  name: string
  description: string
  language: string
  tone: Tone
  expertiseLevel: ExpertiseLevel
  aiInstructions: string
}

// `Tone` et `ExpertiseLevel` sont des unions de littéraux string (pas des enums
// TypeScript) : les valeurs de <select> ci-dessous sont donc directement assignables,
// aucun cast n'est nécessaire lors de l'appel à CreateDomain.
const TONES: Array<[Tone, string]> = [
  ['PROFESSIONAL', 'Professionnel'], ['EDUCATIONAL', 'Pédagogique'], ['JOURNALISTIC', 'Journalistique'],
  ['TECHNICAL', 'Technique'], ['ACCESSIBLE', 'Accessible'], ['PROVOCATIVE', 'Provocateur'], ['NEUTRAL', 'Neutre'],
]

const LEVELS: Array<[ExpertiseLevel, string]> = [
  ['BEGINNER', 'Débutant'], ['INTERMEDIATE', 'Intermédiaire'], ['EXPERT', 'Expert'],
]

export function DomainForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Values>({
    defaultValues: { language: 'fr', tone: 'PROFESSIONAL', expertiseLevel: 'INTERMEDIATE' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await browserSdk.CreateDomain({
        input: {
          name: values.name,
          description: values.description || undefined,
          language: values.language,
          tone: values.tone,
          expertiseLevel: values.expertiseLevel,
          aiInstructions: values.aiInstructions || undefined,
        },
      })
      router.push('/dashboard/domains')
      router.refresh()
    } catch {
      setError('La création a échoué. Vérifiez le nom saisi et réessayez.')
    }
  })

  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      {error && <ErrorState title="Création impossible" message={error} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Nom du domaine</span>
        <input {...register('name', { required: true, minLength: 2 })} placeholder="Cybersécurité" className={field} />
        {formState.errors.name && <span className="text-xs text-red-600">Le nom doit faire au moins 2 caractères</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Description</span>
        <textarea {...register('description')} rows={2} className={field} />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Langue</span>
          <select {...register('language')} className={field}>
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Ton</span>
          <select {...register('tone')} className={field}>
            {TONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Niveau</span>
          <select {...register('expertiseLevel')} className={field}>
            {LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Instructions données à l’IA</span>
        <textarea
          {...register('aiInstructions')} rows={5} className={field}
          placeholder={'Toujours expliquer les concepts techniques avec des exemples.\nÉviter les phrases marketing.\nPrivilégier les informations vérifiables.'}
        />
      </label>

      <Button type="submit" loading={formState.isSubmitting} className="self-start">Créer le domaine</Button>
    </form>
  )
}
