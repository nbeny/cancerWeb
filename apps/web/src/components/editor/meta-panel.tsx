'use client'

import type { ChangeEvent } from 'react'
import { cn } from '@/lib/cn'

export interface MetaFieldsValue {
  seoTitle: string
  metaDescription: string
  focusKeyword: string
  secondaryKeywords: string[]
  canonicalUrl: string
  robotsIndex: boolean
  robotsFollow: boolean
}

interface CategoryOption {
  id: string
  name: string
}

interface TagOption {
  id: string
  name: string
}

interface Props {
  slug: string
  values: MetaFieldsValue
  onChange: (patch: Partial<MetaFieldsValue>) => void
  /**
   * Dernières métriques calculées par l'API (`SeoReport.metrics`), ou `null`
   * si l'article n'a jamais été analysé. Jamais recompté côté client (voir
   * jsdoc plus bas) : les compteurs affichent ces valeurs telles quelles.
   */
  metrics: Record<string, number> | null
  /** `true` tant que le texte a changé depuis le dernier calcul de `metrics` (voir `article-editor.tsx`). */
  metricsStale: boolean
  categories: CategoryOption[]
  categoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  categorySaving?: boolean
  allTags: TagOption[]
  selectedTagIds: string[]
  onTagsChange: (tagIds: string[]) => void
  tagsSaving?: boolean
}

const FIELD = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none'

/**
 * Vert dans le barème, ambre hors barème : mêmes seuils que
 * `apps/api/src/seo/criteria/title.ts` (30–60) et `meta-description.ts`
 * (120–158), donnés explicitement par le cahier des charges de cette tâche.
 * Seuils, pas une réimplémentation du calcul de score : dupliquer une
 * constante figée dans l'énoncé n'introduit aucun risque de divergence,
 * contrairement à recompter la longueur elle-même (voir jsdoc de `Counter`).
 */
function thresholdClass(length: number | undefined, min: number, max: number): string {
  if (length == null) return 'text-slate-400'
  return length >= min && length <= max ? 'text-emerald-600' : 'text-amber-600'
}

/**
 * Affiche `metrics.seoTitleLength` / `metrics.metaDescriptionLength` — jamais
 * `value.length` recompté ici. La consigne de la Task 17 est explicite :
 * l'API est la seule source de vérité pour cette valeur, pour qu'un futur
 * changement de définition (ex. compter les graphèmes plutôt que les unités
 * UTF-16) ne fasse pas diverger silencieusement ce compteur du score réel.
 * Contrepartie assumée : le compteur suit la cadence de la ré-analyse SEO
 * temporisée (voir `article-editor.tsx`), pas chaque frappe — `stale`
 * l'indique visuellement plutôt que de mentir sur sa fraîcheur.
 */
function Counter({ length, min, max, stale }: { length: number | undefined; min: number; max: number; stale: boolean }) {
  return (
    <span className={cn('text-xs', thresholdClass(length, min, max), stale && 'opacity-50')}>
      {length ?? '—'}/{max} caractères ({min}–{max} recommandé)
    </span>
  )
}

// Toutes les métadonnées visibles pendant la frappe, pas seulement après un
// rapport SEO séparé (voir la consigne de la Task 17) : le compteur de
// caractères vit à côté du champ qu'il décrit.
export function MetaPanel({
  slug,
  values,
  onChange,
  metrics,
  metricsStale,
  categories,
  categoryId,
  onCategoryChange,
  categorySaving,
  allTags,
  selectedTagIds,
  onTagsChange,
  tagsSaving,
}: Props) {
  const handleSecondaryKeywords = (event: ChangeEvent<HTMLInputElement>) => {
    const keywords = event.target.value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    onChange({ secondaryKeywords: keywords })
  }

  const toggleTag = (tagId: string) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId]
    onTagsChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-slate-700">Métadonnées</h2>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Titre SEO</span>
        <input
          id="seoTitle"
          value={values.seoTitle}
          onChange={(e) => onChange({ seoTitle: e.target.value })}
          className={FIELD}
        />
        <Counter length={metrics?.seoTitleLength} min={30} max={60} stale={metricsStale} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Meta description</span>
        <textarea
          id="metaDescription"
          value={values.metaDescription}
          onChange={(e) => onChange({ metaDescription: e.target.value })}
          rows={3}
          className={FIELD}
        />
        <Counter length={metrics?.metaDescriptionLength} min={120} max={158} stale={metricsStale} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Mot-clé focus</span>
        <input
          value={values.focusKeyword}
          onChange={(e) => onChange({ focusKeyword: e.target.value })}
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Mots-clés secondaires</span>
        <input
          value={values.secondaryKeywords.join(', ')}
          onChange={handleSecondaryKeywords}
          placeholder="séparés par des virgules"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Slug</span>
        {/* `UpdateArticleInput` n'expose aucun champ `slug` (voir schema.graphql) :
            non modifiable depuis cet écran, affiché en lecture seule plutôt que
            de suggérer une action qui échouerait silencieusement. */}
        <input value={slug} readOnly disabled className={cn(FIELD, 'bg-slate-50 text-slate-500')} />
        <span className="text-xs text-slate-400">Généré automatiquement, non modifiable.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">URL canonique</span>
        <input
          value={values.canonicalUrl}
          onChange={(e) => onChange({ canonicalUrl: e.target.value })}
          className={FIELD}
        />
      </label>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.robotsIndex}
            onChange={(e) => onChange({ robotsIndex: e.target.checked })}
          />
          Indexable (robotsIndex)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.robotsFollow}
            onChange={(e) => onChange({ robotsFollow: e.target.checked })}
          />
          Suivre les liens (robotsFollow)
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Catégorie {categorySaving && '(enregistrement…)'}</span>
        <select
          value={categoryId ?? ''}
          onChange={(e) => onCategoryChange(e.target.value || null)}
          className={FIELD}
        >
          <option value="">Aucune</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Tags {tagsSaving && '(enregistrement…)'}</span>
        <div className="flex flex-wrap gap-2">
          {allTags.length === 0 && <span className="text-xs text-slate-400">Aucun tag dans ce domaine.</span>}
          {allTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={selected}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600',
                )}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
