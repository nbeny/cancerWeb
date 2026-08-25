'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { loginSchema, type LoginValues } from '@cancerweb/validation'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      // Appel depuis le navigateur : le Set-Cookie de l'API arrive directement au navigateur.
      // graphql-request (rawRequest) lève un ClientError dès que la réponse contient `errors`,
      // même en HTTP 200 : ce catch attrape donc bien les échecs d'authentification.
      await browserSdk.Login({ input: values })
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      const code = graphqlErrorCode(error)
      setServerError(
        code === 'RATE_LIMITED'
          ? 'Trop de tentatives. Réessayez dans quelques minutes.'
          : 'Email ou mot de passe incorrect',
      )
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {serverError && <ErrorState title="Connexion impossible" message={serverError} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Email</span>
        <input
          type="email" autoComplete="email" {...register('email')}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
        />
        {formState.errors.email && <span className="text-xs text-red-600">{formState.errors.email.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Mot de passe</span>
        <input
          type="password" autoComplete="current-password" {...register('password')}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
        />
        {formState.errors.password && <span className="text-xs text-red-600">{formState.errors.password.message}</span>}
      </label>

      <Button type="submit" loading={formState.isSubmitting}>Se connecter</Button>
    </form>
  )
}
