import Link from 'next/link'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = { title: 'Connexion — cancerWeb' }

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4">
      <h1 className="text-2xl font-semibold text-slate-900">Connexion</h1>
      <LoginForm />
      <p className="text-sm text-slate-600">
        Pas encore de compte ? <Link href="/auth/register" className="font-medium underline">Créer un compte</Link>
      </p>
    </main>
  )
}
