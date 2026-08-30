import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import unified from 'unified'
import type { Root } from 'mdast'

/**
 * Étend la liste `strip` par défaut de `hast-util-sanitize` (`['script']`,
 * voir `github.json` de cette dépendance) : par défaut, une balise interdite
 * qui n'est PAS dans `strip` est seulement « dépliée » (la balise disparaît,
 * ses enfants sont conservés) — comportement voulu pour un conteneur
 * quelconque non reconnu (ex. une balise custom autour de prose légitime :
 * on garde le texte, on jette juste l'enveloppe). Mais pour les éléments
 * HTML5 « à contenu brut » (catégorie rawtext/RCDATA de la spec), ce
 * contenu n'est JAMAIS destiné à être affiché comme texte de page — code
 * (`script`), règles CSS (`style`), valeur par défaut d'un champ de
 * formulaire (`textarea`), texte de repli d'un cadre (`iframe`, `noframes`),
 * métadonnée d'onglet (`title`), texte préformaté hérité (`xmp`). Le
 * déplier laisserait fuir ce contenu comme texte visible sur le blog public
 * (Lot 3) — voir `render.security.spec.ts`.
 *
 * `form` n'appartient pas à cette catégorie HTML5 (ses enfants sont des
 * noeuds normaux), mais un `<form>` n'a de toute façon aucune place légitime
 * dans le corps d'un article : il produirait par défaut un `<input
 * type="checkbox">` (la case à cocher des listes de tâches GFM, seule raison
 * pour laquelle `input` reste dans la liste blanche) accompagné du texte
 * brut qu'il contenait, un rendu incohérent qu'aucun article légitime ne
 * recherche. Ajouté au même titre, par cohérence de fidélité plutôt que par
 * risque XSS (aucun attribut actif ne survit de toute façon).
 */
// Non explicitement typé en `Schema` (import de `hast-util-sanitize`, une
// dépendance transitive de `rehype-sanitize` non déclarée par ce package —
// `pnpm` en mode strict ne l'expose pas à la résolution de types) :
// `.use(rehypeSanitize, ...)` vérifie de toute façon la structure attendue.
const STRIP_CONTENT_TOO = {
  strip: ['script', 'style', 'textarea', 'iframe', 'title', 'noframes', 'xmp', 'form'],
}

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
    // Schéma étendu, pas remplacé : seule la clé `strip` est fournie, le
    // reste (tagNames, attributes, protocols, ...) retombe sur le schéma
    // GitHub par défaut de `hast-util-sanitize` (fusion superficielle par
    // clé de premier niveau, voir sa jsdoc).
    .use(rehypeSanitize, STRIP_CONTENT_TOO)
    .use(rehypeStringify)

  const hast = processor.runSync(ast as never)
  return processor.stringify(hast as never).toString()
}
