import Link from 'next/link'
import { RegisterForm } from '@/components/auth/register-form'

export const metadata = { title: 'Créer un compte — cancerWeb' }

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4">
      <h1 className="text-2xl font-semibold text-slate-900">Créer un compte</h1>
      <RegisterForm />
      <p className="text-sm text-slate-600">
        Déjà un compte ? <Link href="/auth/login" className="font-medium underline">Se connecter</Link>
      </p>
    </main>
  )
}
