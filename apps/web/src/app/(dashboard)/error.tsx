'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Placé au niveau du groupe de routes (dashboard), pas dans dashboard/ lui-même :
// un error.tsx ne couvre jamais le layout.tsx de son propre segment (voir la
// doc Next.js sur error.js), seulement ses enfants. Comme dashboard/layout.tsx
// peut désormais laisser remonter une erreur (voir dashboard/layout.tsx), la
// limite doit se trouver un niveau au-dessus pour l'attraper.
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Le tableau de bord est indisponible</h1>
      <p className="max-w-md text-sm text-slate-600">
        Une erreur empêche d’afficher cette page (service indisponible, délai
        dépassé…). Ce n’est pas une déconnexion : réessayez dans un instant, ou
        revenez plus tard si le problème persiste.
      </p>
      {error.digest && <p className="text-xs text-slate-400">Référence : {error.digest}</p>}
      <Button onClick={() => retry()}>Réessayer</Button>
    </div>
  )
}
