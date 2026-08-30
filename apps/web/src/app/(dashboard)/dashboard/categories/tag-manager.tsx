'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DomainRole, TagFieldsFragment } from '@cancerweb/graphql'
import { TAG_NAME_MAX_LENGTH, TAG_NAME_MIN_LENGTH } from '@cancerweb/validation'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'

interface Props {
  domainId: string
  tags: TagFieldsFragment[]
  canManage: boolean
  myRole: DomainRole
}

export function TagManager({ domainId, tags: initialTags, canManage, myRole }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [tags, setTags] = useState(initialTags)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<TagFieldsFragment | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const manageReason = canManage ? undefined : `Rôle EDITOR requis pour gérer les tags (rôle actuel : ${myRole})`

  async function handleCreate() {
    const trimmed = name.trim()
    if (trimmed.length < TAG_NAME_MIN_LENGTH || trimmed.length > TAG_NAME_MAX_LENGTH) {
      setError(`Le nom doit contenir entre ${TAG_NAME_MIN_LENGTH} et ${TAG_NAME_MAX_LENGTH} caractères.`)
      return
    }
    setError(null)
    setCreating(true)
    try {
      const { data } = await browserSdk.CreateTag({ domainId, input: { name: trimmed } })
      setTags((current) => [...current, data.createTag].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      showToast({ title: 'Tag créé', variant: 'success' })
      router.refresh()
    } catch (error) {
      showToast({ title: 'Échec de la création du tag', description: graphqlErrorMessage(error), variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await browserSdk.DeleteTag({ domainId, id: deleting.id })
      setTags((current) => current.filter((t) => t.id !== deleting.id))
      showToast({ title: 'Tag supprimé', variant: 'success' })
      setDeleting(null)
      router.refresh()
    } catch (error) {
      showToast({ title: 'Échec de la suppression', description: graphqlErrorMessage(error), variant: 'error' })
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Tags</h2>

      {canManage && (
        <div className="flex flex-wrap items-start gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">Nom du tag</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="Nouveau tag"
              maxLength={TAG_NAME_MAX_LENGTH}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            {error && <span className="text-xs text-red-600">{error}</span>}
          </label>
          <Button onClick={handleCreate} loading={creating}>
            Ajouter
          </Button>
        </div>
      )}

      {tags.length === 0 ? (
        <EmptyState title="Aucun tag" description="Créez des tags pour affiner la classification des articles de ce domaine." />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => setDeleting(tag)}
                disabled={!canManage}
                title={manageReason ?? 'Supprimer ce tag'}
                aria-label={`Supprimer le tag ${tag.name}`}
                className="text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer ce tag ?"
        description={
          deleting &&
          `« ${deleting.name} » sera retiré de tous les articles qui l’utilisent. Les articles eux-mêmes ne seront pas supprimés.`
        }
        confirmLabel="Supprimer"
        variant="danger"
        loading={deletingBusy}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
