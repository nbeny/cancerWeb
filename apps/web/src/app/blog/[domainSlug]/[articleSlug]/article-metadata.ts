import type { Metadata } from 'next'
import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'

/**
 * Traduit les champs SEO d'un article publié en métadonnées Next.js.
 *
 * Fonction pure, séparée de `generateMetadata` : celle-ci est indissociable du
 * chargement réseau et du routage, alors que la correspondance ci-dessous est
 * la seule partie qui puisse être fausse en silence. Un `noindex` posé à
 * l'envers ne casse rien, ne lève rien et ne se voit pas à l'écran — il se
 * constate des semaines plus tard dans l'index d'un moteur de recherche. La
 * rendre testable sans simuler ni SDK ni requête est la raison d'être de ce
 * fichier (voir `article-metadata.test.ts`).
 *
 * Ces quatre champs (`seoTitle`, `metaDescription`, `canonicalUrl`,
 * `robotsIndex`/`robotsFollow`) existent en base et dans le back-office depuis
 * le Lot 1 sans avoir jamais été consommés nulle part : c'est ici, et
 * uniquement ici, qu'ils prennent effet.
 */
export function metadonneesArticle(article: PublicArticleFieldsFragment): Metadata {
  return {
    // Repli sur le titre affiché : `seoTitle` est un champ facultatif, dont
    // l'usage est de RACCOURCIR un titre trop long pour la page de résultats.
    // Vide, il ne veut pas dire « pas de titre », il veut dire « le titre de
    // l'article convient tel quel ».
    title: article.seoTitle ?? article.title,

    // Même logique de repli, en deux temps : `metaDescription` est rédigée
    // pour le moteur de recherche, `excerpt` pour le lecteur. À défaut de la
    // première, la seconde reste un résumé fidèle de l'article — infiniment
    // préférable à laisser le moteur découper lui-même un fragment du corps.
    // `undefined` (et non `null`) au bout : on omet la balise plutôt que d'en
    // émettre une vide.
    description: article.metaDescription ?? article.excerpt ?? undefined,

    // Pas de repli possible ici, et c'est voulu : une URL canonique fabriquée
    // à partir du slug serait une affirmation, pas une valeur par défaut. Si
    // elle désignait la mauvaise page (mauvais domaine, mauvais protocole),
    // elle demanderait aux moteurs de désindexer l'article au profit d'une
    // adresse inexistante. Absente, on n'émet simplement rien et le moteur
    // retient l'URL par laquelle il est arrivé.
    alternates: { canonical: article.canonicalUrl ?? undefined },

    // Next.js sérialise ces deux booléens en `index, follow` ou
    // `noindex, nofollow` — chaque direction est donc explicitement émise,
    // jamais déduite d'une absence de balise.
    robots: { index: article.robotsIndex, follow: article.robotsFollow },
  }
}
