'use client'

import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` pour une action destructive (suppression, rejet...). */
  variant?: 'default' | 'danger'
  loading?: boolean
  onConfirm: () => void
}

// Bâti sur Radix Dialog plutôt que `window.confirm` : ce dernier est une boîte
// native bloquante, ingérable en test (pas de DOM à interroger) comme en
// automatisation (Playwright ne peut pas piloter une boîte de dialogue
// navigateur). Radix gère nativement le piège de focus et la fermeture sur
// Échap (voir sa doc `@radix-ui/react-dialog`) : rien à réimplémenter ici.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg focus:outline-none">
          <Dialog.Title className="text-base font-semibold text-slate-900">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-sm text-slate-600">{description}</Dialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant={variant === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
