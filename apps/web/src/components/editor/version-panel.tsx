'use client'

import { useEffect, useState } from 'react'
import type { ArticleEditorFieldsFragment, ArticleVersionsQuery } from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { diffLinesByLine } from '@/lib/diff-lines'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

type VersionItem = ArticleVersionsQuery['articleVersions'][number]

interface Props {
  domainId: string
  articleId: string
  /** Auteur ET id de l'article, pour retomber sur un nom connu quand `createdById` y correspond (voir jsdoc plus bas). */
  currentAuthor: { id: string; name: string }
  onRestored: (article: ArticleEditorFieldsFragment) => void
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function VersionPanel({ domainId, articleId, currentAuthor, onRestored }: Props) {
  const { showToast } = useToast()
  const [versions, setVersions] = useState<VersionItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [compareFrom, setCompareFrom] = useState<number | null>(null)
  const [compareTo, setCompareTo] = useState<number | null>(null)
  const [restoring, setRestoring] = useState<VersionItem | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    browserSdk
      .ArticleVersions({ domainId, articleId })
      .then(({ data }) => {
        if (cancelled) return
        setVersions(data.articleVersions)
        // Par défaut, comparer les deux versions les plus récentes (ordre
        // décroissant côté API — voir `articleVersions.graphql`) : c'est la
        // comparaison la plus souvent utile à l'ouverture du panneau.
        if (data.articleVersions.length >= 2) {
          setCompareTo(data.articleVersions[0].version)
          setCompareFrom(data.articleVersions[1].version)
        } else if (data.articleVersions.length === 1) {
          setCompareTo(data.articleVersions[0].version)
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(graphqlErrorMessage(error) ?? 'Le chargement de l’historique a échoué.')
      })
    return () => {
      cancelled = true
    }
  }, [domainId, articleId])

  async function confirmRestore() {
    if (!restoring) return
    setRestoreBusy(true)
    try {
      const { data } = await browserSdk.RestoreArticleVersion({ domainId, articleId, version: restoring.version })
      showToast({ title: `Version ${restoring.version} restaurée dans une nouvelle version`, variant: 'success' })
      setRestoring(null)
      onRestored(data.restoreArticleVersion)
      // Recharge l'historique : la restauration vient de créer une nouvelle entrée.
      const refreshed = await browserSdk.ArticleVersions({ domainId, articleId })
      setVersions(refreshed.data.articleVersions)
    } catch (error) {
      showToast({ title: 'Échec de la restauration', description: graphqlErrorMessage(error), variant: 'error' })
    } finally {
      setRestoreBusy(false)
    }
  }

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>
  }

  if (versions === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    )
  }

  if (versions.length === 0) {
    return <p className="text-sm text-slate-500">Aucune version enregistrée pour cet article.</p>
  }

  const fromVersion = versions.find((v) => v.version === compareFrom) ?? null
  const toVersion = versions.find((v) => v.version === compareTo) ?? null
  const diff = fromVersion && toVersion ? diffLinesByLine(fromVersion.content, toVersion.content) : null

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-slate-700">Historique des versions</h2>

      <ul className="flex flex-col gap-2">
        {versions.map((version) => (
          <li key={version.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
            <div>
              <p className="font-medium text-slate-900">
                v{version.version}
                {version.changeNote && <span className="ml-2 font-normal text-slate-500">— {version.changeNote}</span>}
              </p>
              <p className="text-xs text-slate-500">
                {/* `ArticleVersion.createdById` n'a pas de champ `createdBy: User` associé côté schéma
                    (voir schema.graphql) : impossible de résoudre un nom pour un id quelconque depuis le
                    client (aucune query `users`/`domainMembers`). Repli : si l'id correspond à l'auteur de
                    l'article (le cas le plus fréquent), on affiche son nom ; sinon l'identifiant brut,
                    plutôt que d'inventer un nom. Signalé dans le rapport de la Task 16-17. */}
                {version.createdById === currentAuthor.id ? currentAuthor.name : `Utilisateur ${version.createdById.slice(0, 8)}`}
                {' · '}
                {DATE_FORMAT.format(new Date(version.createdAt))}
              </p>
            </div>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setRestoring(version)}>
              Restaurer
            </Button>
          </li>
        ))}
      </ul>

      {versions.length >= 2 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Comparer depuis</span>
              <select
                value={compareFrom ?? ''}
                onChange={(e) => setCompareFrom(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">jusqu’à</span>
              <select
                value={compareTo ?? ''}
                onChange={(e) => setCompareTo(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {diff && (
            <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs">
              {diff.map((line, index) => (
                <div
                  key={index}
                  className={cn(
                    'whitespace-pre-wrap',
                    line.type === 'added' && 'bg-emerald-100 text-emerald-900',
                    line.type === 'removed' && 'bg-red-100 text-red-900',
                  )}
                >
                  {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                  {line.value}
                </div>
              ))}
            </pre>
          )}
        </div>
      )}

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title={`Restaurer la version ${restoring?.version ?? ''} ?`}
        description="Le contenu de cette version sera repris dans une NOUVELLE version : l'historique actuel reste intact et ne régresse pas, cette action est elle-même réversible."
        confirmLabel="Restaurer"
        loading={restoreBusy}
        onConfirm={confirmRestore}
      />
    </div>
  )
}
