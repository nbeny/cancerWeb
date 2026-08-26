# Lot 1 — Éditorial — Design

Date : 2026-08-26
Statut : validé, prêt pour rédaction du plan d'implémentation
Socle : `2026-08-25-plateforme-editoriale-ia-design.md` (Lot 0 livré et fusionné)

---

## 1. Objectif

Rendre la plateforme utilisable pour écrire, structurer, évaluer et faire circuler des articles — **sans aucune intervention d'IA**. Le Lot 2 branchera la génération automatique sur un modèle éditorial déjà éprouvé par un usage manuel.

C'est un choix de séquencement délibéré : construire la génération IA avant l'éditeur reviendrait à valider des sorties de modèle contre une cible qui n'existe pas encore.

### Décisions cadrantes prises avec l'utilisateur

| Sujet | Décision | Raison |
|---|---|---|
| Surface d'édition | CodeMirror 6, Markdown coloré, aperçu côte à côte | Ce qui est tapé est ce qui est stocké : aucune conversion, donc aucune dégradation silencieuse d'un article à l'ouverture. Le patch IA du Lot 2 opère sur des plages de lignes sans risque de désynchronisation. |
| Composition du score SEO | Pondéré par catégorie, **plafonné à 60 sur faute bloquante** | Empêche un score rassurant qui masque un défaut fatal. Déterminant pour le Lot 2, où l'IA se fiera à ce score pour juger un article publiable. |
| Granularité des versions | Aux moments significatifs, dont **avant toute action IA** | Rend les réécritures automatiques du Lot 2 réversibles. Sans ce point, une amélioration IA ratée écrase le travail de l'auteur sans recours. |
| Transitions de statut | Séparation stricte auteur / éditeur | Traduit dans les rôles le principe « IA → revue humaine → publication ». Un auteur qui peut s'auto-publier vide cette garantie, et l'IA du Lot 2 héritera des droits de l'utilisateur qui déclenche la génération. |

---

## 2. Préalable obligatoire : build de `packages/validation`

Le Lot 0 a établi empiriquement que ce paquet **n'est pas consommable par l'API** : il ne publie que du TypeScript source, que le bundler de Next.js sait traiter mais pas `tsc` nu suivi de `node`. Les règles de validation de l'authentification sont donc aujourd'hui dupliquées entre `packages/validation` et `class-validator`.

Sans correction, le Lot 1 étend cette duplication à tous les schémas d'articles, de topics et de catégories.

**Correction :** émission de JavaScript et de déclarations dans `dist/`, `main`/`types` pointant vers cette sortie, script `build` exécuté avant celui de l'API, et dépendance déclarée. Puis suppression des duplications existantes.

**Vérification exigée :** `nest build` puis `node dist/main` doivent fonctionner avec un import réel de `@cancerweb/validation` depuis l'API — le `typecheck` ne suffit pas à le prouver, c'est ce qui avait masqué le problème.

---

## 3. Module `markdown/` — fonctions pures

`apps/api/src/markdown/`, sans base, sans réseau, sans NestJS.

```ts
parse(md: string): Root
render(ast: Root): string                 // HTML sanitizé
extractHeadings(ast): Heading[]           // { depth, text, line }
extractLinks(ast): { internal: Link[]; external: Link[] }
extractImages(ast): ImageRef[]            // { src, alt, line }
countWords(ast): number
splitSections(ast): Section[]             // { heading, startLine, endLine }
```

**Pourquoi tout passe par l'AST et jamais par des expressions régulières :** un `#` en début de ligne dans un bloc de code n'est pas un titre, un `[texte](url)` dans un bloc littéral n'est pas un lien. Une analyse par motif produit des faux positifs que personne ne remarque jusqu'à ce qu'un score SEO devienne absurde.

**Sanitization à l'écriture, pas à la lecture.** Le Markdown peut contenir du HTML brut. `render` produit du HTML déjà nettoyé, stocké dans `Article.renderedHtml` : le blog public du Lot 3 sert du HTML figé sans re-traiter quoi que ce soit à chaque requête.

`splitSections` n'a pas de consommateur dans ce lot. Il est écrit ici parce qu'il appartient au module et que son test unitaire est trivial maintenant ; il devient le point d'ancrage des patchs IA au Lot 2.

---

## 4. Analyseur SEO

`apps/api/src/seo/analyzer.ts` — fonction pure.

```ts
analyzeSeo(ast: Root, ctx: SeoContext): SeoReportData

interface SeoContext {
  seoTitle: string | null
  metaDescription: string | null
  focusKeyword: string | null
  slug: string
  language: string
}

interface SeoReportData {
  score: number                 // 0-100
  cappedBy: string[]            // codes des fautes bloquantes
  issues: SeoIssue[]            // { code, severity, message, field }
  metrics: Record<string, number>
}
```

### Barème

| Catégorie | Poids | Bloquant si |
|---|---|---|
| Titre SEO | 20 | — |
| Meta description | 15 | absente |
| Structure des titres | 15 | zéro ou plusieurs H1 |
| Mot-clé focus | 15 | — |
| Longueur | 10 | moins de 300 mots |
| Liens internes et externes | 10 | — |
| Lisibilité | 10 | — |
| Images et attributs `alt` | 5 | — |

Une seule faute bloquante plafonne le score à **60**, quel que soit le total brut. Le rapport expose `cappedBy` afin que l'interface — et l'IA du Lot 2 — sache *pourquoi* le score est plafonné.

### Dépendance à la langue

La lisibilité se calcule par une formule calibrée par langue. Appliquer une formule anglaise à du français produit un chiffre faux mais crédible, ce qui est pire qu'aucun chiffre.

**Règle retenue :** langue couverte (`fr`, `en`) → catégorie évaluée normalement ; langue non couverte → catégorie **neutralisée**, son poids redistribué proportionnellement sur les autres, et une `issue` de sévérité informative signale que la lisibilité n'a pas été mesurée. Le score reste sur 100 et reste comparable.

### Ce que l'analyseur ne fait pas

`analyzeSeo` est une **mutation** et non une query, bien qu'elle soit synchrone : elle écrit un `SeoReport` et met à jour `Article.latestSeoScore`, la valeur dénormalisée sur laquelle reposent le tri et le filtre de `/dashboard/articles`. Une query qui écrit en base serait un piège pour tout client supposant les queries sans effet de bord.

Il ne consulte ni la base, ni le réseau, ni un modèle. Il ne sait pas si un lien interne pointe vers un article existant — cette vérification appartient au service, qui l'ajoute au rapport. Cette séparation est ce qui rend l'analyseur testable en millisecondes et reproductible.

---

## 5. Transitions de statut

Machine à états explicite dans `apps/api/src/articles/transitions.ts`, séparée du service.

```
DRAFT ──submit──▶ REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED
  ▲                 │                     │                     │
  └──── reject ─────┘                     └──schedule──▶ SCHEDULED
                                                               │
ARCHIVED ◀──────────────── archive ────────────────────────────┘
```

| Transition | AUTHOR | EDITOR | OWNER |
|---|:---:|:---:|:---:|
| `DRAFT → REVIEW` | ✓ | ✓ | ✓ |
| `REVIEW → DRAFT` (rejet) | — | ✓ | ✓ |
| `REVIEW → APPROVED` | — | ✓ | ✓ |
| `APPROVED → PUBLISHED` | — | ✓ | ✓ |
| `APPROVED → SCHEDULED` | — | ✓ | ✓ |
| `PUBLISHED → ARCHIVED` | — | ✓ | ✓ |
| Supprimer | — | — | ✓ |

Un `AUTHOR` ne modifie que **ses propres** articles ; un `EDITOR` modifie tous ceux du domaine.

**Code d'erreur :** une transition refusée renvoie `FORBIDDEN` et non `NOT_FOUND`. La distinction avec le Lot 0 est délibérée : là-bas, masquer l'existence d'un domaine empêchait l'énumération d'identifiants ; ici, l'article est déjà visible de l'utilisateur, seule l'action est refusée. Renvoyer `NOT_FOUND` serait mensonger et rendrait l'interface incompréhensible.

`publishArticle` positionne `publishedAt`. `scheduleArticle` exige un `scheduledAt` futur. La publication effective des articles programmés appartient au Lot 3.

---

## 6. Versions

`ArticleVersion` existe déjà (snapshot complet : titre, contenu, `seoSnapshot`, `changeNote`, auteur).

Un instantané est créé :
1. à la création de l'article (`v1`) ;
2. à chaque transition de statut, avec le libellé de la transition ;
3. sur demande explicite de l'auteur ;
4. **avant toute modification par un agent automatique** — aucun consommateur dans ce lot, mais le point d'entrée du service est écrit et testé ici.

Le contenu courant est enregistré en continu dans `Article.content` sans créer de version : l'historique reste lisible.

Restaurer une version crée une **nouvelle** version portant l'ancien contenu, plutôt que de rembobiner. L'historique reste ainsi strictement croissant et une restauration est elle-même réversible.

---

## 7. Surface GraphQL

```graphql
# Topics — création manuelle uniquement dans ce lot
topics(filter: TopicFilter!, page: PageInput, sort: TopicSort): TopicConnection!
topic(id: ID!): Topic
createTopic(input: CreateTopicInput!): Topic!
updateTopic(id: ID!, input: UpdateTopicInput!): Topic!
selectTopic(id: ID!): Topic!
rejectTopic(id: ID!): Topic!

# Articles
articles(filter: ArticleFilter!, page: PageInput, sort: ArticleSort): ArticleConnection!
article(id: ID!): Article
createArticle(input: CreateArticleInput!): Article!      # topicId optionnel
updateArticle(id: ID!, input: UpdateArticleInput!): Article!
deleteArticle(id: ID!): Boolean!

# Versions
articleVersions(articleId: ID!): [ArticleVersion!]!
createArticleVersion(articleId: ID!, changeNote: String): ArticleVersion!
restoreArticleVersion(articleId: ID!, version: Int!): Article!

# SEO — synchrone et déterministe
analyzeSeo(articleId: ID!): SeoReport!      # MUTATION : persiste un SeoReport
seoReports(articleId: ID!, page: PageInput): SeoReportConnection!   # query

# Transitions
submitForReview / approveArticle / rejectArticle
publishArticle / scheduleArticle / archiveArticle

# Taxonomie
categories(domainId: ID!): [Category!]!
createCategory / updateCategory / deleteCategory
tags(domainId: ID!): [Tag!]!
createTag / deleteTag
```

`ArticleFilter` : `domainId`, `status[]`, `authorId`, `categoryId`, `tagIds`, `search`, `minSeoScore`, `publishedBetween`.

**Recherche full-text :** la colonne `searchVector` et son index GIN existent depuis le Lot 0 mais n'ont jamais servi. Prisma ne sait pas les interroger : le service passe par `$queryRaw` avec des paramètres liés — jamais d'interpolation de chaîne, la requête vient de l'utilisateur.

### DataLoader

`Article.author`, `Article.domain`, `Article.category`, `Article.tags` sont les premiers champs imbriqués du schéma. Sans DataLoader, lister 50 articles déclenche jusqu'à 200 requêtes. Loaders par requête, injectés dans le contexte GraphQL.

**Effet secondaire attendu :** ces champs imbriqués rendent enfin exerçable la **limite de profondeur GraphQL**, restée sans couverture depuis le Lot 0 faute de chemin imbriqué de plus de trois niveaux. Le test différé deux fois est écrit dans ce lot.

**Test anti-N+1 :** compter les requêtes Prisma émises pendant une requête GraphQL listant 20 articles avec leurs relations, et exiger un nombre borné. Sans ce test, une régression de DataLoader est invisible — tout continue de fonctionner, simplement plus lentement.

---

## 8. Frontend

```
/dashboard/topics                 liste, création, sélection, rejet
/dashboard/articles               recherche, filtres, tri, pagination
/dashboard/articles/[id]          éditeur complet
/dashboard/categories             taxonomie du domaine
```

### Éditeur

Deux colonnes — CodeMirror 6 en Markdown coloré, aperçu rendu — et trois panneaux latéraux :

- **SEO** : score, ceinture de fautes bloquantes, liste des problèmes par gravité. Recalcul temporisé après la frappe.
- **Métadonnées** : titre SEO, meta description, mot-clé focus, mots-clés secondaires, slug, `robots`, canonique.
- **Historique** : versions, diff textuel, restauration avec confirmation.

Le score SEO n'est **pas** recalculé à chaque frappe : appel temporisé, et indicateur visuel d'obsolescence tant que le calcul n'a pas convergé. Un score qui clignote à chaque caractère est inexploitable.

### Primitives livrées ici

`DataTable` (tri, pagination, état vide), `ConfirmDialog`, `Toast` — différées au Lot 0 faute de consommateur, elles en ont un maintenant.

---

## 9. Tests

**Unitaires — l'essentiel de l'effort.** `markdown/` et `seo/` sont des fonctions pures : tests nombreux, rapides, portant sur les cas tordus autant que sur le cas nominal.

Cas explicitement à couvrir, parce qu'ils cassent les analyses naïves : un `#` dans un bloc de code n'est pas un titre ; un lien dans un bloc littéral n'est pas un lien ; une image sans `alt` ; un article vide ; un article sans H1 ; deux H1 ; un saut de niveau H2 → H4 ; un mot-clé présent uniquement dans un mot plus long ; une langue non couverte par la formule de lisibilité.

**Intégration.** Matrice complète des transitions par rôle — chaque case du tableau de la section 5 est un test. Versions et restauration. Recherche full-text, y compris avec des caractères spéciaux. Absence de N+1. Un `AUTHOR` ne modifie pas l'article d'un autre.

**Frontend.** Logique de l'éditeur (temporisation, obsolescence du score), rendu du `DataTable`.

**E2E.** Un parcours éditorial complet : créer un topic, en tirer un article, écrire, voir le score SEO évoluer, soumettre en revue, approuver avec un second compte éditeur, publier.

---

## 10. Ce que ce lot ne fait pas

Génération IA (Lot 2), blog public et publication effective des articles programmés (Lot 3), fact-checking sourcé et automatisations (Lot 4).

Les dettes du Lot 0 traitées ici : build de `packages/validation`, test de profondeur GraphQL, `country` absent de `UpdateDomainInput`.

Les dettes du Lot 0 **non** traitées ici, et assumées : le job E2E de la CI n'a toujours pas tourné sur un runner GitHub.
