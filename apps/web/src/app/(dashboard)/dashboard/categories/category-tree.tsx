'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CategoryFieldsFragment, DomainRole } from '@cancerweb/graphql'
import { CATEGORY_DESCRIPTION_MAX_LENGTH, CATEGORY_NAME_MAX_LENGTH, CATEGORY_NAME_MIN_LENGTH } from '@cancerweb/validation'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import * as Dialog from '@radix-ui/react-dialog'
import { buildTree, selfAndDescendants, type CategoryNode } from './tree'

interface Props {
  domainId: string
  categories: CategoryFieldsFragment[]
  canManage: boolean
  myRole: DomainRole
}

type FormState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; category: CategoryFieldsFragment }

export function CategoryTree({ domainId, categories: initialCategories, canManage, myRole }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [categories, setCategories] = useState(initialCategories)
  const [form, setForm] = useState<FormState | null>(null)
  const [deleting, setDeleting] = useState<CategoryFieldsFragment | null>(null)
  const [busy, setBusy] = useState(false)

  const manageReason = canManage ? undefined : `Rôle EDITOR requis pour gérer les catégories (rôle actuel : ${myRole})`
  const tree = buildTree(categories)

  async function handleSubmit(values: { name: string; description: string; parentId: string | null }) {
    setBusy(true)
    try {
      if (form?.mode === 'edit') {
        const { data } = await browserSdk.UpdateCategory({
          domainId,
          id: form.category.id,
          input: { name: values.name, description: values.description || null, parentId: values.parentId },
        })
        setCategories((current) => current.map((c) => (c.id === data.updateCategory.id ? data.updateCategory : c)))
        showToast({ title: 'Catégorie modifiée', variant: 'success' })
      } else {
        const { data } = await browserSdk.CreateCategory({
          domainId,
          input: { name: values.name, description: values.description || undefined, parentId: values.parentId ?? undefined },
        })
        setCategories((current) => [...current, data.createCategory])
        showToast({ title: 'Catégorie créée', variant: 'success' })
      }
      setForm(null)
      router.refresh()
    } catch (error) {
      showToast({ title: 'Échec de l’enregistrement', description: graphqlErrorMessage(error), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await browserSdk.DeleteCategory({ domainId, id: deleting.id })
      setCategories((current) =>
        current
          .filter((c) => c.id !== deleting.id)
          // Les enfants directs deviennent des catégories racines — reflète
          // côté client exactement ce que fait le serveur (`onDelete: SetNull`
          // sur `Category.parent`, voir `CategoriesService.remove`).
          .map((c) => (c.parentId === deleting.id ? { ...c, parentId: null } : c)),
      )
      showToast({ title: 'Catégorie supprimée', variant: 'success' })
      setDeleting(null)
      router.refresh()
    } catch (error) {
      showToast({ title: 'Échec de la suppression', description: graphqlErrorMessage(error), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const directChildrenCount = deleting ? categories.filter((c) => c.parentId === deleting.id).length : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Catégories</h2>
        <Button onClick={() => setForm({ mode: 'create', parentId: null })} disabled={!canManage} title={manageReason}>
          Nouvelle catégorie
        </Button>
      </div>

      {tree.length === 0 ? (
        <EmptyState
          title="Aucune catégorie"
          description="Créez une première catégorie pour organiser les articles de ce domaine."
        />
      ) : (
        <ul className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-2">
          {tree.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              depth={0}
              canManage={canManage}
              manageReason={manageReason}
              onAddChild={(parentId) => setForm({ mode: 'create', parentId })}
              onEdit={(category) => setForm({ mode: 'edit', category })}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}

      {form && (
        <CategoryFormDialog
          form={form}
          categories={categories}
          busy={busy}
          onOpenChange={(open) => !open && setForm(null)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer cette catégorie ?"
        description={
          deleting && (
            <>
              « {deleting.name} » sera définitivement supprimée.
              {directChildrenCount > 0 && (
                <>
                  {' '}
                  Ses {directChildrenCount} sous-catégorie{directChildrenCount > 1 ? 's' : ''} directe
                  {directChildrenCount > 1 ? 's' : ''} deviendr{directChildrenCount > 1 ? 'ont' : 'a'} des catégories
                  racines.
                </>
              )}
              {deleting.articleCount > 0 && (
                <>
                  {' '}
                  {deleting.articleCount} article{deleting.articleCount > 1 ? 's' : ''} perdr
                  {deleting.articleCount > 1 ? 'ont' : 'a'} cette catégorie (mise à « aucune »), sans être supprimé
                  {deleting.articleCount > 1 ? 's' : ''}.
                </>
              )}
            </>
          )
        }
        confirmLabel="Supprimer"
        variant="danger"
        loading={busy}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

interface RowProps {
  node: CategoryNode
  depth: number
  canManage: boolean
  manageReason?: string
  onAddChild: (parentId: string) => void
  onEdit: (category: CategoryFieldsFragment) => void
  onDelete: (category: CategoryFieldsFragment) => void
}

function CategoryRow({ node, depth, canManage, manageReason, onAddChild, onEdit, onDelete }: RowProps) {
  return (
    <li>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
        style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{node.name}</span>
          {node.articleCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {node.articleCount} article{node.articleCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onAddChild(node.id)} disabled={!canManage} title={manageReason}>
            + Sous-catégorie
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onEdit(node)} disabled={!canManage} title={manageReason}>
            Modifier
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-xs text-red-600" onClick={() => onDelete(node)} disabled={!canManage} title={manageReason}>
            Supprimer
          </Button>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <CategoryRow
              key={child.id}
              node={child}
              depth={depth + 1}
              canManage={canManage}
              manageReason={manageReason}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

interface FormDialogProps {
  form: FormState
  categories: CategoryFieldsFragment[]
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: { name: string; description: string; parentId: string | null }) => void
}

// Dialogue dédié (pas `ConfirmDialog`, qui ne porte pas de champs de
// formulaire) : construit sur le même primitif Radix, pour les mêmes raisons
// (piège de focus, fermeture Échap — voir la jsdoc de `ConfirmDialog`).
function CategoryFormDialog({ form, categories, busy, onOpenChange, onSubmit }: FormDialogProps) {
  const editing = form.mode === 'edit' ? form.category : null
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [parentId, setParentId] = useState<string>(
    editing ? (editing.parentId ?? '') : (form.mode === 'create' ? (form.parentId ?? '') : ''),
  )
  const [error, setError] = useState<string | null>(null)

  // Exclut la catégorie éditée et ses descendants des choix de parent : un
  // parent choisi parmi eux créerait un cycle évident, autant ne pas le
  // proposer (le serveur reste l'autorité finale — voir
  // `CategoriesService.assertNoCycle` pour les cycles indirects).
  const excluded = editing ? selfAndDescendants(editing.id, categories) : new Set<string>()
  const parentOptions = categories.filter((c) => !excluded.has(c.id))

  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'

  function submit() {
    const trimmed = name.trim()
    if (trimmed.length < CATEGORY_NAME_MIN_LENGTH || trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
      setError(`Le nom doit contenir entre ${CATEGORY_NAME_MIN_LENGTH} et ${CATEGORY_NAME_MAX_LENGTH} caractères.`)
      return
    }
    setError(null)
    onSubmit({ name: trimmed, description: description.trim(), parentId: parentId || null })
  }

  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg focus:outline-none">
          <Dialog.Title className="text-base font-semibold text-slate-900">
            {editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </Dialog.Title>
          <div className="mt-4 flex flex-col gap-4">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Nom</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={CATEGORY_NAME_MAX_LENGTH}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Description</span>
              <textarea
                value={description ?? ''}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
                rows={3}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Catégorie parente</span>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={field}>
                <option value="">Aucune (catégorie racine)</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </Dialog.Close>
            <Button type="button" loading={busy} onClick={submit}>
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
