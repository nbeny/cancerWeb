'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type {
  ArticleEditorFieldsFragment,
  ArticleStatusFieldsFragment,
  SeoReportFieldsFragment,
  UpdateArticleInput,
} from '@cancerweb/graphql'
import { browserSdk } from '@/lib/graphql-client'
import { graphqlErrorMessage } from '@/lib/graphql-error'
import { cn } from '@/lib/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { ArticlePreview } from './preview'
import { SaveIndicator, type SaveStatus } from './save-indicator'
import { MetaPanel, type MetaFieldsValue } from './meta-panel'
import { SeoPanel } from './seo-panel'
import { VersionPanel } from './version-panel'
import { TransitionBar } from './transition-bar'

// Voir la jsdoc de `markdown-editor.tsx` : CodeMirror ne doit jamais être
// évalué côté serveur. `ssr: false` est la seule façon de le garantir avec
// l'App Router (un import statique, même dans un Client Component, est
// quand même exécuté lors du rendu serveur initial de la page) — vérifié au
// `next build` réel, pas seulement au typecheck (voir le rapport de tâche).
const MarkdownEditor = dynamic(() => import('./markdown-editor').then((mod) => mod.MarkdownEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

const SAVE_DEBOUNCE_MS = 1500

interface EditableFields {
  title: string
  content: string
  excerpt: string
  coverImageUrl: string
  seoTitle: string
  metaDescription: string
  focusKeyword: string
  secondaryKeywords: string[]
  canonicalUrl: string
  robotsIndex: boolean
  robotsFollow: boolean
}

function toFields(article: ArticleEditorFieldsFragment): EditableFields {
  return {
    title: article.title,
    content: article.content,
    excerpt: article.excerpt ?? '',
    coverImageUrl: article.coverImageUrl ?? '',
    seoTitle: article.seoTitle ?? '',
    metaDescription: article.metaDescription ?? '',
    focusKeyword: article.focusKeyword ?? '',
    secondaryKeywords: article.secondaryKeywords,
    canonicalUrl: article.canonicalUrl ?? '',
    robotsIndex: article.robotsIndex,
    robotsFollow: article.robotsFollow,
  }
}

function toInput(fields: EditableFields): UpdateArticleInput {
  return {
    title: fields.title,
    content: fields.content,
    excerpt: fields.excerpt || null,
    coverImageUrl: fields.coverImageUrl || null,
    seoTitle: fields.seoTitle || null,
    metaDescription: fields.metaDescription || null,
    focusKeyword: fields.focusKeyword || null,
    secondaryKeywords: fields.secondaryKeywords,
    canonicalUrl: fields.canonicalUrl || null,
    robotsIndex: fields.robotsIndex,
    robotsFollow: fields.robotsFollow,
  }
}

// Champs `MetaPanel` connus, pointables par id DOM pour `onIssueClick` (voir
// plus bas). Seuls `seoTitle`/`metaDescription` portent aujourd'hui un
// `issue.field` côté analyseur (voir `apps/api/src/seo/criteria/*.ts`) : les
// autres problèmes (structure, liens, images...) n'ont pas de champ unique à
// cibler et restent non cliquables (`seo-panel.tsx` les désactive déjà).
const FOCUSABLE_FIELD_IDS = new Set(['seoTitle', 'metaDescription'])

interface Props {
  domainId: string
  article: ArticleEditorFieldsFragment
  categories: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  initialSeoReport: SeoReportFieldsFragment | null
}

type Tab = 'meta' | 'seo' | 'versions'

export function ArticleEditor({ domainId, article: initialArticle, categories, allTags, initialSeoReport }: Props) {
  const [article, setArticle] = useState(initialArticle)
  const [fields, setFields] = useState<EditableFields>(() => toFields(initialArticle))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined)
  const [seoReport, setSeoReport] = useState(initialSeoReport)
  const [seoStale, setSeoStale] = useState(false)
  const [seoAnalyzing, setSeoAnalyzing] = useState(false)
  const [seoAnalyzeError, setSeoAnalyzeError] = useState<string | undefined>(undefined)
  const [categorySaving, setCategorySaving] = useState(false)
  const [tagsSaving, setTagsSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('meta')

  // Refs plutôt que fermetures directes : `doSave`/`runAnalyze` s'exécutent
  // après un `setTimeout`, potentiellement bien après le rendu qui les a
  // programmés — lire `fields` directement les figerait sur leur valeur au
  // moment de la planification, pas au moment de l'envoi.
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
      // Correction 7 (revue finale du Lot 1) : `analyzeSeo` INSÈRE une ligne
      // `SeoReport` à chaque appel, sans déduplication, et relance en plus
      // une requête séquentielle par lien interne. Le rappeler ici à chaque
      // sauvegarde temporisée (1,5 s) produisait des centaines de rapports
      // par article au fil d'une session de rédaction, sur une table sans
      // purge. Seule une action explicite de l'utilisateur (le bouton
      // « Analyser »/« Réanalyser » de `seo-panel.tsx`, ou la restauration
      // d'une version dans `handleRestored`) déclenche maintenant une
      // analyse — `seoStale` (déjà mis à `true` par `updateField`) suffit à
      // signaler visuellement que le score affiché est périmé en attendant.
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
    setSeoStale(true)
    scheduleSave()
  }

  async function runAnalyze() {
    setSeoAnalyzing(true)
    setSeoAnalyzeError(undefined)
    try {
      const { data } = await browserSdk.AnalyzeSeo({ domainId, articleId: article.id })
      setSeoReport(data.analyzeSeo)
    } catch (error) {
      setSeoAnalyzeError(graphqlErrorMessage(error) ?? 'L’analyse SEO a échoué.')
    } finally {
      setSeoAnalyzing(false)
      setSeoStale(false)
    }
  }

  async function handleCategoryChange(categoryId: string | null) {
    setCategorySaving(true)
    try {
      const { data } = await browserSdk.SetArticleCategory({ domainId, articleId: article.id, categoryId })
      setArticle((current) => ({ ...current, category: data.setArticleCategory.category }))
    } catch {
      // Le select reprend simplement sa valeur précédente au prochain rendu
      // (`article.category` n'a pas changé) : pas de perte de saisie possible
      // ici, contrairement au contenu — une simple absence de mise à jour suffit.
    } finally {
      setCategorySaving(false)
    }
  }

  async function handleTagsChange(tagIds: string[]) {
    setTagsSaving(true)
    try {
      const { data } = await browserSdk.SetArticleTags({ domainId, articleId: article.id, tagIds })
      setArticle((current) => ({ ...current, tags: data.setArticleTags.tags }))
    } finally {
      setTagsSaving(false)
    }
  }

  function handleTransitioned(patch: ArticleStatusFieldsFragment) {
    setArticle((current) => ({ ...current, ...patch }))
  }

  function handleRestored(restored: ArticleEditorFieldsFragment) {
    setArticle(restored)
    setFields(toFields(restored))
    setSaveStatus('saved')
    setSeoStale(true)
    void runAnalyze()
  }

  function handleIssueClick(field: string | null) {
    if (!field || !FOCUSABLE_FIELD_IDS.has(field)) return
    setTab('meta')
    // Le changement d'onglet ci-dessus ne monte le champ dans le DOM qu'au
    // rendu suivant : reporter le focus après ce rendu.
    requestAnimationFrame(() => {
      const el = document.getElementById(field)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus()
    })
  }

  const metaValues: MetaFieldsValue = {
    seoTitle: fields.seoTitle,
    metaDescription: fields.metaDescription,
    focusKeyword: fields.focusKeyword,
    secondaryKeywords: fields.secondaryKeywords,
    canonicalUrl: fields.canonicalUrl,
    robotsIndex: fields.robotsIndex,
    robotsFollow: fields.robotsFollow,
  }
  const metrics = (seoReport?.metrics as Record<string, number> | undefined) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        <TransitionBar
          domainId={domainId}
          articleId={article.id}
          status={article.status}
          myRole={article.domain.myRole}
          onTransitioned={handleTransitioned}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2" style={{ height: '65vh' }}>
        <MarkdownEditor value={fields.content} onChange={(value) => updateField({ content: value })} />
        <ArticlePreview html={article.renderedHtml ?? ''} stale={saveStatus !== 'saved'} />
      </div>

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="flex border-b border-slate-200">
          {(
            [
              ['meta', 'Métadonnées'],
              ['seo', 'SEO'],
              ['versions', 'Versions'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'px-4 py-2 text-sm font-medium',
                tab === value ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'meta' && (
            <MetaPanel
              slug={article.slug}
              values={metaValues}
              onChange={updateField}
              metrics={metrics}
              metricsStale={seoStale || seoAnalyzing}
              categories={categories}
              categoryId={article.category?.id ?? null}
              onCategoryChange={handleCategoryChange}
              categorySaving={categorySaving}
              allTags={allTags}
              selectedTagIds={article.tags.map((t) => t.id)}
              onTagsChange={handleTagsChange}
              tagsSaving={tagsSaving}
            />
          )}
          {tab === 'seo' && (
            <SeoPanel
              report={seoReport}
              stale={seoStale || seoAnalyzing}
              analyzing={seoAnalyzing}
              analyzeError={seoAnalyzeError}
              onAnalyze={() => void runAnalyze()}
              onIssueClick={handleIssueClick}
            />
          )}
          {tab === 'versions' && (
            <VersionPanel domainId={domainId} articleId={article.id} currentAuthor={article.author} onRestored={handleRestored} />
          )}
        </div>
      </div>
    </div>
  )
}
