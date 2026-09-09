'use client'

import { useDeferredValue } from 'react'
import Markdown, { type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn } from '@/lib/cn'
import { STYLE_CORPS_MARKDOWN } from '@/lib/markdown-body-style'

interface Props {
  /** Markdown source en cours d'édition (`fields.content`), rendu ici même. */
  markdown: string
}

// Même liste que `STRIP_CONTENT_TOO` dans `apps/api/src/markdown/render.ts`,
// et pour la même raison : `hast-util-sanitize` ne « strippe » par défaut que
// `script`, et se contente de DÉPLIER les autres balises interdites (la
// balise disparaît, ses enfants restent). Pour les éléments HTML5 à contenu
// brut (rawtext/RCDATA), ce contenu n'est jamais destiné à être lu comme
// texte de page : le déplier le ferait apparaître en clair dans l'aperçu.
// Toute modification ici doit être répercutée côté API, et inversement — le
// test `preview.test.tsx` verrouille la liste.
export const STRIP_TAGS = ['script', 'style', 'textarea', 'iframe', 'title', 'noframes', 'xmp', 'form']

// `rehype-sanitize` v6 REMPLACE le schéma qu'on lui passe (contrairement à la
// v4 utilisée côté API, qui fusionnait clé à clé) : on étale explicitement
// `defaultSchema` — le schéma GitHub — pour ne garder de nos ajouts que
// `strip`.
const SANITIZE_SCHEMA = { ...defaultSchema, strip: STRIP_TAGS }

// Constantes de module, pas des littéraux inline : react-markdown reconstruit
// toute sa chaîne unified quand l'identité de ces tableaux change, ce qui
// arriverait à chaque frappe.
const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm]
// `rehypeRaw` avant `rehypeSanitize`, exactement comme côté serveur : le HTML
// littéral du Markdown est d'abord reparsé en vrais nœuds, que la
// sanitization peut alors retirer en entier (balise ET contenu) plutôt que de
// laisser fuir leur texte.
const REHYPE_PLUGINS: Options['rehypePlugins'] = [rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]

/**
 * Aperçu rendu côté client à partir du Markdown en cours de saisie, avec la
 * même chaîne unified que `apps/api/src/markdown` (remark-gfm → rehype-raw →
 * rehype-sanitize) : l'aperçu suit la frappe au lieu d'attendre l'aller-retour
 * de la sauvegarde temporisée.
 *
 * Ce composant ne sert QUE le back-office. Le blog public continue d'afficher
 * `Article.renderedHtml`, calculé et sanitizé côté serveur (voir
 * `app/blog/[domainSlug]/[articleSlug]/article-view.tsx`) : le HTML servi au
 * lecteur final ne dépend donc à aucun moment de ce rendu client.
 *
 * `useDeferredValue` : le rendu Markdown complet à chaque frappe rendrait la
 * saisie saccadée sur un article long. React garde l'aperçu précédent affiché
 * et le recalcule en tâche de fond, sans que la frappe attende.
 */
export function ArticlePreview({ markdown }: Props) {
  const deferred = useDeferredValue(markdown)
  const pending = deferred !== markdown

  return (
    // `min-h-0` : même correctif que `markdown-editor.tsx` (voir sa jsdoc) —
    // cette `<div>` est l'autre item direct de la même grille CSS à hauteur
    // fixe (`65vh`), et son contenu défilant (`overflow-y-auto` plus bas)
    // aurait la même possibilité de déborder de la ligne de grille sans lui.
    <div className="flex h-full min-h-0 flex-col gap-2">
      <h2 className="text-sm font-medium text-slate-700">Aperçu</h2>
      <div
        className={cn(
          'h-full max-w-none overflow-y-auto rounded-md border border-slate-200 bg-white p-6 text-slate-800 transition-opacity',
          // Exactement l'habillage du blog public (voir
          // `markdown-body-style.ts`) : c'est ce qui fait de ce panneau un
          // aperçu et non une seconde mise en forme.
          STYLE_CORPS_MARKDOWN,
          pending && 'opacity-70',
        )}
      >
        {deferred.trim() ? (
          <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
            {deferred}
          </Markdown>
        ) : (
          <p className="text-sm italic text-slate-400">
            L’aperçu s’affichera ici au fur et à mesure de la rédaction.
          </p>
        )}
      </div>
    </div>
  )
}
