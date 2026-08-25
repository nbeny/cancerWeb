'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { registerSchema, type RegisterValues } from '@cancerweb/validation'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

export function RegisterForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await browserSdk.Register({ input: values })
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      const code = graphqlErrorCode(error)
      setServerError(
        code === 'CONFLICT'
          ? 'Cet email est déjà utilisé.'
          : 'Impossible de créer le compte. Vérifiez les informations saisies.',
      )
    }
  })

  const field = 'rounded-md border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none'

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {serverError && <ErrorState title="Inscription impossible" message={serverError} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Email</span>
        <input type="email" autoComplete="email" {...register('email')} className={field} />
        {formState.errors.email && <span className="text-xs text-red-600">{formState.errors.email.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Nom</span>
        <input type="text" autoComplete="name" {...register('name')} className={field} />
        {formState.errors.name && <span className="text-xs text-red-600">{formState.errors.name.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Mot de passe</span>
        <input type="password" autoComplete="new-password" {...register('password')} className={field} />
        {formState.errors.password && <span className="text-xs text-red-600">{formState.errors.password.message}</span>}
      </label>

      <Button type="submit" loading={formState.isSubmitting}>Créer mon compte</Button>
    </form>
  )
}
