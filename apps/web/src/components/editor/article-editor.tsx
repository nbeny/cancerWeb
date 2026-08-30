'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { ArticleEditorFieldsFragment, UpdateArticleInput } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { ArticlePreview } from './preview'
import { SaveIndicator, type SaveStatus } from './save-indicator'

// Voir la jsdoc de `markdown-editor.tsx` : CodeMirror ne doit jamais être
// évalué côté serveur. `ssr: false` est la seule façon de le garantir avec
// l'App Router (un import statique, même dans un Client Component, est
// quand même prérendu côté serveur par défaut, voir
// `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`) — vérifié
// au `next build` réel, pas seulement au typecheck (voir le rapport de tâche).
const MarkdownEditor = dynamic(() => import('./markdown-editor').then((mod) => mod.MarkdownEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

const SAVE_DEBOUNCE_MS = 1500

interface EditableFields {
  title: string
  content: string
}

function toFields(article: ArticleEditorFieldsFragment): EditableFields {
  return { title: article.title, content: article.content }
}

function toInput(fields: EditableFields): UpdateArticleInput {
  return { title: fields.title, content: fields.content }
}

interface Props {
  domainId: string
  article: ArticleEditorFieldsFragment
}

export function ArticleEditor({ domainId, article: initialArticle }: Props) {
  const [article, setArticle] = useState(initialArticle)
  const [fields, setFields] = useState<EditableFields>(() => toFields(initialArticle))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined)

  // Refs plutôt que fermetures directes : `doSave` s'exécute après un
  // `setTimeout`, potentiellement bien après le rendu qui l'a programmé —
  // lire `fields` directement le figerait sur sa valeur au moment de la
  // planification, pas au moment de l'envoi.
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  function scheduleSave() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void doSave()
    }, SAVE_DEBOUNCE_MS)
  }

  async function doSave() {
    // Une sauvegarde est déjà en vol : on ne double-envoie pas une requête
    // concurrente (qui pourrait revenir dans le désordre et écraser un état
    // plus récent) — on retentera juste après celle-ci si de nouvelles
    // modifications sont arrivées entre-temps (voir le `finally` ci-dessous).
    if (savingRef.current) {
      dirtyRef.current = true
      return
    }
    savingRef.current = true
    dirtyRef.current = false
    setSaveStatus('saving')
    setSaveErrorMessage(undefined)
    try {
      const { data } = await browserSdk.UpdateArticle({ domainId, id: article.id, input: toInput(fieldsRef.current) })
      setArticle(data.updateArticle)
      setSaveStatus('saved')
    } catch (error) {
      // Le texte saisi N'EST PAS effacé ni écrasé ici : `fields` reste tel
      // quel, seul l'indicateur change. `retrySave` (bouton "Réessayer" du
      // `SaveIndicator`) renvoie exactement ce même contenu.
      setSaveStatus('error')
      setSaveErrorMessage(graphqlErrorMessage(error) ?? 'Vérifiez votre connexion, puis réessayez.')
    } finally {
      savingRef.current = false
      if (dirtyRef.current) {
        dirtyRef.current = false
        scheduleSave()
      }
    }
  }

  function updateField(patch: Partial<EditableFields>) {
    setFields((current) => ({ ...current, ...patch }))
    setSaveStatus('unsaved')
    scheduleSave()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-1 flex-col gap-2">
        <input
          value={fields.title}
          onChange={(e) => updateField({ title: e.target.value })}
          className="w-full max-w-2xl rounded-md border border-slate-300 px-3 py-2 text-lg font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
          aria-label="Titre de l’article"
        />
        <div className="flex items-center gap-3">
          <StatusBadge status={article.status} />
          <SaveIndicator status={saveStatus} errorMessage={saveErrorMessage} onRetry={saveStatus === 'error' ? () => void doSave() : undefined} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2" style={{ height: '65vh' }}>
        <MarkdownEditor value={fields.content} onChange={(value) => updateField({ content: value })} />
        <ArticlePreview html={article.renderedHtml ?? ''} stale={saveStatus !== 'saved'} />
      </div>
    </div>
  )
}
