'use client'

import { useMemo } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'

interface Props {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  ariaLabel?: string
}

// CodeMirror 6 (via `@uiw/react-codemirror`) touche `document`/`navigator` dès
// la construction de la vue : ce module ne doit JAMAIS être évalué côté
// serveur. Il est donc chargé exclusivement via `next/dynamic(..., { ssr:
// false })` depuis `article-editor.tsx` — jamais importé statiquement par un
// Server Component ni par un module partagé serveur/navigateur. `tsc
// --noEmit` ne voit aucune différence entre les deux façons de l'importer :
// seul `next build` (qui tente réellement le rendu serveur du composant)
// révèle l'erreur si ce garde-fou est retiré.
//
// `EditorView.lineWrapping` : retour à la ligne automatique, pour ne jamais
// faire défiler horizontalement un paragraphe de prose (contrairement à du
// code, où une ligne longue non wrappée est acceptable).
export function MarkdownEditor({ value, onChange, readOnly, ariaLabel = 'Contenu Markdown de l’article' }: Props) {
  // `aria-label` sur le `<div>` englobant ci-dessous ne suffit pas : CodeMirror
  // pose lui-même `role="textbox"` sur son `contentDOM` interne (voir
  // `@codemirror/view`, `updateAttrs`), et le nom accessible d'un élément
  // porteur de rôle ne remonte jamais depuis un ancêtre — seul
  // `EditorView.contentAttributes` permet de poser l'attribut directement sur
  // cet élément. Sans ce fix, `getByRole('textbox', { name: ariaLabel })` ne
  // trouve rien (constaté en écrivant le test E2E de la Task 19).
  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': ariaLabel })],
    [ariaLabel],
  )

  return (
    // `min-h-0` en plus de `h-full` : sans lui, cette `<div>` (élément direct
    // de la grille CSS `grid` posée par `article-editor.tsx`, avec une hauteur
    // fixe `65vh`) hérite du `min-height: auto` par défaut d'un item de
    // grille — son contenu (le scroller interne de CodeMirror) peut alors le
    // faire grandir AU-DELÀ de `65vh` au lieu d'être contenu et de défiler
    // (`overflow-hidden` seul ne suffit pas à l'empêcher). Constaté en
    // écrivant le test E2E de la Task 19 : un paragraphe assez long pour être
    // enveloppé (`lineWrapping`) sur de nombreuses lignes visuelles faisait
    // déborder l'éditeur par-dessus la barre d'onglets Métadonnées/SEO/Versions
    // juste en dessous, la rendant non cliquable — un vrai bug d'utilisation,
    // pas seulement un souci de sélecteur de test.
    <div className="h-full min-h-0 overflow-hidden rounded-md border border-slate-300">
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        height="100%"
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly }}
        className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
      />
    </div>
  )
}
