import { cn } from '@/lib/cn'

interface Props {
  /** HTML déjà sanitizé côté serveur (`Article.renderedHtml`) — jamais réinterprété ici. */
  html: string
  /** L'aperçu retarde d'un cycle de sauvegarde temporisée sur le texte affiché à gauche. */
  stale?: boolean
}

// Aucun moteur Markdown côté client : réimplémenter le rendu ferait
// inévitablement diverger l'aperçu du HTML réellement publié (échappement,
// extensions, liens internes...). `renderedHtml` est LE rendu qui sera servi
// au lecteur final ; l'aperçu se contente de l'afficher, quitte à accepter un
// léger retard le temps que la sauvegarde temporisée aboutisse (voir
// `article-editor.tsx`).
//
// `dangerouslySetInnerHTML` est intentionnel et sûr ici : `html` provient de
// `Article.renderedHtml`, DÉJÀ sanitizé côté serveur (voir
// `apps/api/src/markdown`, invoqué avant toute écriture en base) — jamais une
// chaîne saisie librement par CE composant. Le sanitizer côté client
// n'existe pas dans ce dépôt et n'a pas à exister : dupliquer la sanitation
// côté client créerait exactement la même divergence que réimplémenter le
// rendu Markdown, ce que cette page évite explicitement.
export function ArticlePreview({ html, stale }: Props) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Aperçu</h2>
        {stale && (
          <span className="text-xs italic text-slate-400" role="status">
            Aperçu en cours de mise à jour…
          </span>
        )}
      </div>
      <div
        className={cn(
          'prose prose-slate h-full max-w-none overflow-y-auto rounded-md border border-slate-200 bg-white p-6 transition-opacity',
          stale && 'opacity-60',
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
