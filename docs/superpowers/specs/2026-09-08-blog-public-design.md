# Lot B — Blog public par sous-domaine

**Date :** 2026-09-08
**Statut :** design validé. Découpé en B1 (ce lot) et B2 (suite).

## Objectif

Chaque domaine éditorial dispose d'un blog public, servi sur son propre
sous-domaine, accessible sans compte. Le back-office actuel reste sur l'hôte
nu.

## Contraintes vérifiées avant conception

Testées, pas supposées :

- **Caddy ne demande aucune modification en développement.** Son bloc `:3000`
  accepte déjà n'importe quel en-tête `Host` : `cybersecurite.localhost:3000`
  et `nimportequoi.localhost:3000` atteignent tous deux l'application
  (HTTP 307, la redirection actuelle de la racine).
- **`*.localhost` est résolu nativement en 127.0.0.1**, sans toucher au
  fichier `hosts`.
- **Tout est fermé par défaut.** `GqlAuthGuard` est un `APP_GUARD` global ;
  seules les mutations d'authentification portent `@Public()`. Aucun chemin de
  lecture non authentifié n'existe aujourd'hui.
- **`REVALIDATE_SECRET` est déclaré dans `.env` et `.env.example` mais utilisé
  nulle part** : emplacement laissé pour une revalidation jamais branchée.
- **Aucun middleware Next n'existe** (`apps/web/src/middleware.ts` absent).
- La racine `/` redirige aujourd'hui vers le tableau de bord (commit
  `b32099e`). Le middleware devra passer AVANT cette redirection, sinon un
  visiteur du blog atterrirait sur le back-office.

Le modèle de données est déjà complet : `Article` porte `slug` (unique par
domaine), `status`, `publishedAt`, `renderedHtml`, `excerpt`,
`coverImageUrl`, `seoTitle`, `metaDescription`, `canonicalUrl`, `robotsIndex`,
`robotsFollow`. `Domain.slug` est `@unique`. `Category` et `Tag` portent
chacun `@@unique([domainId, slug])`.

## Architecture

### Routage par sous-domaine

Un middleware Next lit l'en-tête `Host`, en extrait le sous-domaine et le
traite comme un `Domain.slug`. La requête est réécrite vers un groupe de
routes public paramétré par ce slug. L'hôte nu continue de servir le
back-office existant, inchangé.

Un sous-domaine qui ne correspond à aucun domaine, ou qui correspond à un
domaine sans aucun article publié, renvoie 404 — jamais une page vide. Cela
règle aussi un effet de bord réel : la base contient douze domaines de test
e2e qui exposeraient sinon douze blogs.

### API publique — le point sensible du lot

Des résolveurs **dédiés**, marqués `@Public()`, dans leur propre module. Ils
ne réutilisent aucun résolveur du back-office et exposent des **types GraphQL
séparés** ne portant que les champs publics.

Ce n'est pas une précaution théorique : `Article.rationale` est une
justification éditoriale interne, ajoutée au Lot A, qui n'a rien à faire sur
un blog public. Un type dédié rend ce genre de fuite structurellement
impossible, au lieu de la faire dépendre d'un `select` correct qu'une
évolution future pourrait élargir par inadvertance.

Filtres appliqués en dur, jamais paramétrables depuis la requête :

- `status = PUBLISHED` ;
- `publishedAt <= maintenant` — sans quoi un article programmé fuiterait
  avant sa date ;
- appartenance au domaine résolu depuis le sous-domaine appelé.

### Rendu et invalidation

Pages statiques, régénérées à la demande. Un *route handler*
`/api/revalidate`, protégé par `REVALIDATE_SECRET`, est appelé par l'API
lorsqu'un article est publié, modifié ou retiré. Les pages de liste
concernées sont invalidées en même temps que la page de l'article : publier
un article qui n'apparaît pas en page d'accueil serait un demi-succès.

## Découpage

Le périmètre complet est trop large pour un seul plan testable. Deux
sous-lots, chacun livrant quelque chose d'utilisable :

### B1 — le blog marche (ce lot)

- Middleware de résolution du sous-domaine, 404 sur domaine inconnu ou vide.
- Module GraphQL public : types dédiés, résolveurs `@Public()`, filtres en dur.
- Page d'accueil paginée listant les articles publiés du domaine.
- Page d'article : rendu, date, image de couverture, métadonnées SEO.
- Revalidation à la demande déclenchée par les transitions de publication.

### B2 — le blog se navigue et s'indexe (suite)

- Pages catégorie et tag.
- Recherche plein texte, via la colonne générée `searchVector` existante.
- `sitemap.xml`, `robots.txt`, flux RSS. Le sitemap respecte `robotsIndex` et
  `robotsFollow` de chaque article.

**Hors périmètre, décidé :** pas de page auteur.

## Tests

**Unitaires** — extraction du sous-domaine depuis `Host` (hôte nu, sous-domaine
simple, port, casse, hôte inconnu).

**Intégration** — les résolveurs publics, sans aucun cookie d'authentification :
un article `DRAFT` n'est jamais renvoyé ; un article `SCHEDULED` dont
`publishedAt` est dans le futur n'est jamais renvoyé ; un article publié d'un
AUTRE domaine n'est jamais renvoyé ; le type public ne porte pas `rationale`.
Ces tests sont la garantie principale du lot : ils vérifient une absence, ce
qu'aucune vérification manuelle ne fait de façon fiable.

**Vérification réelle** — parcours d'un blog sur son sous-domaine, article
compris, puis publication d'un nouvel article et constat qu'il apparaît sans
redémarrage.

## Risques assumés

- **Fuite de contenu non publié.** C'est le risque central. Il est traité par
  des types et des résolveurs séparés plus des tests d'absence, pas par une
  relecture attentive.
- **Sous-domaines en production.** Le développement ne demande rien ; un
  déploiement réel exigera un certificat joker et un enregistrement DNS
  joker. Hors périmètre de ce lot, mais à ne pas découvrir le jour du
  déploiement.
- **Domaines de test e2e.** Douze domaines factices existent en base. La règle
  « 404 si aucun article publié » les masque, sans nettoyage de données.
