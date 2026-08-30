import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

interface Props {
  status: SaveStatus
  errorMessage?: string
  onRetry?: () => void
}

const LABELS: Record<SaveStatus, string> = {
  unsaved: 'Modifications non enregistrées',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Échec de l’enregistrement',
}

const STYLES: Record<SaveStatus, string> = {
  unsaved: 'text-amber-700',
  saving: 'text-slate-500',
  saved: 'text-emerald-700',
  error: 'text-red-700',
}

// Un éditeur qui ne dit pas si le travail est sauvegardé est une source
// d'angoisse et de perte de contenu perçue (même quand rien n'est réellement
// perdu) : cet indicateur est donc TOUJOURS visible, jamais un simple toast
// qui disparaît. `role="status"`/`aria-live="polite"` pour qu'un lecteur
// d'écran annonce les transitions sans avoir à re-consulter l'écran.
export function SaveIndicator({ status, errorMessage, onRetry }: Props) {
  return (
    <div className="flex items-center gap-3 text-sm" role="status" aria-live="polite">
      <span className={cn('flex items-center gap-1.5 font-medium', STYLES[status])}>
        {status === 'saving' && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {LABELS[status]}
      </span>
      {status === 'error' && (
        <>
          {errorMessage && <span className="text-red-600">{errorMessage}</span>}
          {onRetry && (
            <Button variant="secondary" onClick={onRetry} className="px-2 py-1 text-xs">
              Réessayer
            </Button>
          )}
        </>
      )}
    </div>
  )
}
