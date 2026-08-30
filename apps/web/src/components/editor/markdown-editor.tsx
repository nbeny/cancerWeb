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
  const extensions = useMemo(() => [markdown(), EditorView.lineWrapping], [])

  return (
    <div className="h-full overflow-hidden rounded-md border border-slate-300" aria-label={ariaLabel}>
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
