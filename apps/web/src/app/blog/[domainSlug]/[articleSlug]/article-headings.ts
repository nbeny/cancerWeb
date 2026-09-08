const FERMANTE = '</h1>'

/**
 * Éléments de bloc. Leur présence DANS un `<h1>` signale que cet `<h1>` n'est
 * pas un titre mais un conteneur mal fermé (voir `normaliserTitresCorps`).
 */
const CONTIENT_UN_BLOC = /<(?:p|div|h[1-6]|ul|ol|li|pre|blockquote|table|section|article|figure|hr)[\s/>]/i

/**
 * Index de la prochaine balise ouvrante `<h1>` à partir de `depuis`, ou -1.
 *
 * Le caractère qui suit `<h1` est vérifié : sans ça, un hypothétique `<h10>`
 * ou `<h1x>` serait pris pour un titre. Seuls `>`, `/` et un blanc terminent
 * réellement un nom de balise.
 */
function prochainH1(html: string, depuis: number): number {
  for (let i = html.indexOf('<h1', depuis); i !== -1; i = html.indexOf('<h1', i + 3)) {
    const suivant = html[i + 3]
    if (suivant === '>' || suivant === '/' || (suivant !== undefined && /\s/.test(suivant))) return i
  }
  return -1
}

/**
 * Index situé juste APRÈS le `>` qui termine la balise ouvrante commençant à
 * `debut`, ou -1 si elle n'est jamais fermée.
 *
 * C'est ici que se joue la robustesse de tout ce module. Le raccourci évident
 * — `/<h1[^>]*>/` — est faux : `hast-util-to-html` n'échappe PAS le `>` dans
 * une valeur d'attribut, et émet donc littéralement `<h1 title="a>b">`
 * (vérifié en exécutant `render(parse(...))` de `apps/api/src/markdown` sur
 * cette entrée). Le `[^>]*` s'arrêterait au `>` du milieu de l'attribut, la
 * balise serait coupée en deux et le HTML détruit. On avance donc caractère
 * par caractère en ignorant tout ce qui se trouve entre guillemets — les
 * valeurs d'attribut émises par le sérialiseur sont toujours entre
 * guillemets, ce qui rend ce parcours exact sur son entrée réelle.
 */
function finBaliseOuvrante(html: string, debut: number): number {
  let guillemet: string | undefined
  for (let i = debut + 3; i < html.length; i++) {
    const c = html[i]
    if (guillemet !== undefined) {
      if (c === guillemet) guillemet = undefined
    } else if (c === '"' || c === "'") {
      guillemet = c
    } else if (c === '>') {
      return i + 1
    }
  }
  return -1
}

/**
 * Réserve le niveau `<h1>` de la page au titre canonique de l'article, en
 * neutralisant les `<h1>` que porte le corps rendu.
 *
 * POURQUOI. Le Markdown de la quasi-totalité des articles commence par
 * `# Titre`, que le rendu transforme en `<h1>` — la page en affichait donc
 * deux, le sien et celui du corps. Mais ce n'est pas systématique : certains
 * articles n'ont pas de titre de tête. Le comportement ne peut donc pas
 * dépendre de ce que le modèle a choisi d'écrire, et les deux formes doivent
 * aboutir au même résultat : exactement un `<h1>`, celui de la page, qui
 * porte toujours le `title` de la base — jamais du texte libre puisé dans le
 * corps, qui pourrait diverger du `<title>` et de la balise Open Graph.
 *
 * DEUX RÈGLES, parce que deux situations différentes :
 *
 *  - un `<h1>` EN TÊTE du corps est le titre de l'article, redonné une
 *    seconde fois. On le retire : le conserver, même rétrogradé en `<h2>`,
 *    afficherait le même texte deux fois de suite.
 *  - un `<h1>` AILLEURS est du contenu, pas un titre en double. On le
 *    rétrograde en `<h2>` (attributs conservés, donc les ancres survivent)
 *    plutôt que de le supprimer. Cette forme est absente des données
 *    actuelles, mais rien n'empêche un modèle d'émettre un second `#` : la
 *    garantie « exactement un `<h1>` » ne doit pas reposer sur son
 *    obéissance.
 *
 * CE QUE CETTE FONCTION N'EST PAS. Ce n'est PAS une sanitation, et elle n'en
 * prend aucune part. L'innocuité de `renderedHtml` est établie, entièrement et
 * uniquement, par `rehype-sanitize` dans `apps/api/src/markdown/render.ts`,
 * avant écriture en base. Ici on ajuste un niveau de titre pour une raison de
 * structure de page ; on ne retire aucune balise active, et surtout on ne
 * fournit aucune garantie de sécurité sur laquelle un lecteur ultérieur
 * pourrait croire pouvoir s'appuyer. Si la sanitation disparaissait côté API,
 * rien ici ne la remplacerait — et c'est voulu.
 *
 * Fonction pure, sans dépendance : c'est ce qui permet de la couvrir
 * exhaustivement (voir `article-headings.test.ts`).
 */
export function normaliserTitresCorps(html: string): string {
  const morceaux: string[] = []
  let curseur = 0
  let premier = true

  for (let debut = prochainH1(html, 0); debut !== -1; debut = prochainH1(html, curseur)) {
    const finOuvrante = finBaliseOuvrante(html, debut)
    // Balise ouvrante ou fermante introuvable : on renonce à toucher au reste
    // plutôt que de couper le document à un endroit qu'on n'a pas compris.
    if (finOuvrante === -1) break
    const debutFermante = html.indexOf(FERMANTE, finOuvrante)
    if (debutFermante === -1) break

    const interieur = html.slice(finOuvrante, debutFermante)
    // Seul le tout premier `<h1>` peut être « en tête » ; `trim()` autorise
    // les blancs que le sérialiseur laisse devant (un commentaire HTML retiré
    // par la sanitation laisse par exemple un saut de ligne).
    const enTete = premier && html.slice(0, debut).trim() === ''
    premier = false

    morceaux.push(html.slice(curseur, debut))

    // Un titre ne contient jamais de bloc. Quand c'en est un, c'est que le
    // corps portait un `<h1>` JAMAIS FERMÉ : le parseur HTML le referme alors
    // à la fin du document, et l'élément englobe tout l'article. Le supprimer
    // comme un titre de tête viderait la page entière — on le rétrograde donc,
    // ce qui ne perd aucun contenu.
    if (enTete && !CONTIENT_UN_BLOC.test(interieur)) {
      curseur = debutFermante + FERMANTE.length
      continue
    }

    const attributs = html.slice(debut + 3, finOuvrante - 1)
    morceaux.push(`<h2${attributs}>${interieur}</h2>`)
    curseur = debutFermante + FERMANTE.length
  }

  morceaux.push(html.slice(curseur))
  return morceaux.join('').trim()
}
