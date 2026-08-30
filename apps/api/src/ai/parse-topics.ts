import visit from 'unist-util-visit'
import toString from 'mdast-util-to-string'
import type { List } from 'mdast'
import { extractHeadings, parse } from '../markdown'
import type { TopicDraft } from './ai-task.types'

/**
 * `generateTopics` accepte trois formes de sortie, essayées dans cet ordre :
 *
 * 1. **JSON** — un tableau d'objets `{ title, angle? }` ou de simples
 *    chaînes. C'est la forme produite par `FakeAIProvider` (voir
 *    `TOPICS_FIXTURE` dans `providers/fake.provider.ts`), et celle qu'un
 *    modèle produit le plus naturellement quand on lui montre un exemple —
 *    même si le prompt (`prompts/topics.prompt.ts`) demande du Markdown.
 * 2. **Titres de niveau 2 Markdown** (`## Sujet`) — la forme demandée en
 *    premier par le prompt, cohérente avec le choix du lot de préférer le
 *    Markdown au JSON pour la sortie du modèle (voir `outline-validation.ts`).
 * 3. **Liste à puces Markdown** (`- Sujet`) — alternative que le prompt
 *    accepte explicitement, un modèle produisant plus spontanément des
 *    listes à puces que des titres pour une liste courte d'idées.
 *
 * La première forme qui produit au moins un sujet gagne ; aucune ne doit
 * faire lever d'exception pour une entrée qu'elle ne reconnaît pas, seule
 * l'absence totale de résultat après les trois tentatives est une erreur.
 */
export function parseTopics(text: string): TopicDraft[] {
  const trimmed = text.trim()

  const fromJson = parseTopicsFromJson(trimmed)
  if (fromJson.length > 0) return fromJson

  const ast = parse(trimmed)

  const fromHeadings = parseTopicsFromHeadings(ast)
  if (fromHeadings.length > 0) return fromHeadings

  const fromBullets = parseTopicsFromBullets(ast)
  if (fromBullets.length > 0) return fromBullets

  throw new Error(
    "Impossible d'extraire une liste de sujets depuis la réponse du modèle : ni JSON, ni titres de niveau 2, ni liste à puces reconnaissables.",
  )
}

/**
 * Repère le premier tableau JSON présent dans le texte, même entouré de
 * texte parasite (préambule ou commentaire du modèle) : `[` au premier
 * indice, `]` au dernier, tel quel. Un modèle CLI verbeux ajoute souvent une
 * phrase avant ou après le JSON demandé ; échouer sur ce bruit reproduirait
 * l'exact problème qui a fait préférer le Markdown au JSON pour `OUTLINE`.
 */
function parseTopicsFromJson(text: string): TopicDraft[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.map(topicFromJsonEntry).filter((topic): topic is TopicDraft => topic !== undefined)
}

function topicFromJsonEntry(entry: unknown): TopicDraft | undefined {
  if (typeof entry === 'string') {
    const title = entry.trim()
    return title ? { title } : undefined
  }

  if (!entry || typeof entry !== 'object') return undefined

  const obj = entry as Record<string, unknown>
  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  if (!title) return undefined

  const draft: TopicDraft = { title }

  // Le fixture de FakeAIProvider utilise `angle` ; on accepte aussi
  // `suggestedAngle`, le nom du champ Prisma correspondant, pour ne pas
  // dépendre d'une convention de nommage précise du modèle.
  const angle = obj.suggestedAngle ?? obj.angle
  if (typeof angle === 'string' && angle.trim()) draft.suggestedAngle = angle.trim()

  if (typeof obj.description === 'string' && obj.description.trim()) draft.description = obj.description.trim()

  if (Array.isArray(obj.keywords)) {
    const keywords = obj.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    if (keywords.length > 0) draft.keywords = keywords
  }

  return draft
}

/** Un sujet par titre de niveau 2 — la structure imbriquée (H3+) n'a pas de sens pour une liste de sujets plats. */
function parseTopicsFromHeadings(ast: ReturnType<typeof parse>): TopicDraft[] {
  return extractHeadings(ast)
    .filter((h) => h.depth === 2 && h.text.trim().length > 0)
    .map((h) => ({ title: h.text.trim() }))
}

/** Un sujet par item de la ou des listes à puces/numérotées du document. */
function parseTopicsFromBullets(ast: ReturnType<typeof parse>): TopicDraft[] {
  const topics: TopicDraft[] = []
  visit(ast, 'list', (list: List) => {
    for (const item of list.children) {
      const title = toString(item).trim()
      if (title) topics.push({ title })
    }
  })
  return topics
}
