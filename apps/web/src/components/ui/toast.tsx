'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { cn } from '@/lib/cn'

export type ToastVariant = 'success' | 'error'

interface ToastInput {
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastMessage extends ToastInput {
  id: string
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast doit être utilisé sous <ToastProvider>')
  return context
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
}

const AUTO_DISMISS_MS = 5000

// Un seul fournisseur au niveau du layout du dashboard : n'importe quel
// composant descendant (formulaires, tableaux, dialogues de confirmation)
// peut déclencher un toast via `useToast()` sans avoir à gérer sa propre pile
// de notifications. Basé sur Radix Toast, qui prend en charge la
// disparition automatique (`duration`) et le swipe-to-dismiss.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((current) => [...current, { ...toast, id }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={AUTO_DISMISS_MS}>
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            className={cn(
              'relative flex flex-col gap-1 rounded-md border px-4 py-3 pr-8 shadow-md',
              VARIANT_STYLES[toast.variant],
            )}
            onOpenChange={(open) => {
              if (!open) dismiss(toast.id)
            }}
          >
            {/* `role="status"`/`aria-live="polite"` explicites : on ne dépend pas
                de la région d'annonce interne de Radix pour garantir que les
                lecteurs d'écran annoncent le message, et pour que ce soit
                trivialement vérifiable en test. */}
            <div role="status" aria-live="polite" className="flex flex-col gap-1">
              <ToastPrimitive.Title className="text-sm font-medium">{toast.title}</ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="text-sm">{toast.description}</ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Fermer la notification"
              className="absolute right-2 top-2 text-current opacity-60 hover:opacity-100"
            >
              ×
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}
