import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import unified from 'unified'
import type { Root } from 'mdast'

/**
 * Transforme un AST mdast (produit par `parse`) en HTML sanitizé.
 *
 * La sanitization (`rehype-sanitize`) est la seule barrière entre du Markdown
 * dont le contenu n'est pas fiable (généré par une IA côté back-office, Lot 2)
 * et le navigateur d'un visiteur public (Lot 3). Elle retire notamment :
 *   - les balises actives (`<script>`, `<style>` non whitelistée, etc.) ;
 *   - les attributs porteurs de comportement (`onerror`, `onclick`, ...) ;
 *   - les schémas d'URL dangereux (`javascript:`) dans `href`/`src`.
 *
 * Ne jamais retirer `rehype-sanitize` de cette chaîne, même temporairement,
 * sans revalider aussitôt les tests d'injection de `parse.spec.ts`.
 *
 * Fonction pure : pas d'accès disque, réseau ou base de données.
 */
export function render(ast: Root): string {
  const processor = unified()
    // `allowDangerousHtml` + `rehype-raw` : le Markdown source peut contenir
    // du HTML littéral (ex. `<script>...</script>`). Sans ces deux étapes,
    // remark-rehype se contenterait de retirer les balises brutes tout en
    // laissant leur contenu textuel intact (ex. "alert(1)" survivrait comme
    // simple texte). En les activant, ce HTML brut est reparsé en véritables
    // nœuds de l'arbre, que `rehype-sanitize` peut alors analyser et retirer
    // intégralement (balise ET contenu) selon sa liste blanche.
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeStringify)

  const hast = processor.runSync(ast as never)
  return processor.stringify(hast as never).toString()
}
