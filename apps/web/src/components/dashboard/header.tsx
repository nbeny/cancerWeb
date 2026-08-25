'use client'

import { useRouter } from 'next/navigation'
import { browserSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'

export function Header({ userName }: { userName: string }) {
  const router = useRouter()

  const logout = async () => {
    try {
      await browserSdk.Logout()
    } catch {
      // Même en cas d'échec (session déjà expirée, par exemple), on renvoie
      // l'utilisateur vers le login : rester sur le dashboard serait pire.
    }
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600">{userName}</span>
        <Button variant="ghost" onClick={logout}>Déconnexion</Button>
      </div>
    </header>
  )
}
