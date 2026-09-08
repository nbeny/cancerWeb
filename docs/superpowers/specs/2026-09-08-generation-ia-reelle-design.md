# Lot A — Génération IA réelle, ancrée dans le domaine et non répétitive

**Date :** 2026-09-08
**Statut :** design validé, prêt pour le plan d'implémentation

## Problème

Trois défauts distincts, constatés en exécutant l'application :

1. **Le contenu ne change jamais.** `FakeAIProvider` renvoie trois fixtures
   codées en dur. Deux générations successives produisent les mêmes sujets.
2. **Le contenu ignore le domaine.** Les fixtures parlent de cancer ; lancées
   sur le domaine « Cybersécurité », elles ont produit « Nutrition et
   traitements du cancer », « Vivre avec un cancer chronique »,
   « Comprendre l'immunothérapie moderne ».
3. **Rien n'explique pourquoi un sujet a été proposé.** `Topic` porte
   `description` (résumé) et `suggestedAngle` (angle éditorial), mais aucun
   champ ne justifie l'intérêt du sujet *pour ce domaine*.

Cause commune des deux premiers : `AI_PROVIDER=cli` est **impossible à
activer**. `selectAIProvider` (`apps/api/src/ai/ai.module.ts`) lève une
exception pour `cli` et `http`. `CliAgentProvider` existe et est testé, mais
aucun module ne l'instancie. Seul `fake` démarre, y compris en production.

## Contraintes vérifiées avant conception

Ces points ont été testés, pas supposés :

- `opencode-ai@1.18.25` s'installe et s'exécute sur `node:22-alpine`
  (le binaire natif téléchargé au `postinstall` fonctionne sous musl).
- Depuis un conteneur Alpine nu, **sans aucune credential**, `opencode run`
  écrit bien `output.md` — le contrat exact attendu par `CliAgentProvider`.
  `opencode auth list` affiche 0 credentials : la passerelle gratuite ne
  demande pas de clé. **Aucun secret à gérer.**
- `AI_MODEL=opencode/hy3-free`, la valeur actuelle de `.env`, est **hors
  service** : trois appels, trois `UnknownError / Unexpected server error`.
  `opencode/mimo-v2.5-free` et `opencode/nemotron-3.5-lightning-free`
  répondent correctement.
- `Domain.slug` existe déjà et est `@unique` (utile au Lot B, hors périmètre ici).

## Hors périmètre

Le blog public par sous-domaine est un sous-système indépendant : front
public, SEO, rendu d'articles, routage par sous-domaine. Il fait l'objet du
**Lot B**, avec sa propre spec. Le présent lot ne touche à rien de public.

## Conception

### 1. Brancher la vraie génération

| Fichier | Changement |
|---|---|
| `apps/api/src/ai/ai.module.ts` | `selectAIProvider` retourne `CliAgentProvider` pour `'cli'`. `http` continue de lever. `CliAgentProvider` rejoint les `providers` du module et la factory. |
| `docker/api.Dockerfile` | `npm i -g opencode-ai@1.18.25` dans l'étage runtime. Version épinglée : un CLI qui change de contrat de sortie casserait `CliAgentProvider` en silence. |
| `docker-compose.yml` | Service `worker` : `AI_PROVIDER: cli` (le `fake` codé en dur disparaît), `HOME` inscriptible, volume nommé monté sur `AI_WORKSPACE_DIR`. |
| `.env`, `.env.example` | `AI_MODEL=opencode/mimo-v2.5-free`. |

Le service `api` conserve `AI_PROVIDER=fake` : il n'appelle jamais le modèle,
seul le worker exécute les étapes du pipeline. `fake` reste le provider des
tests unitaires et d'intégration, inchangé — c'est ce qui garde la CI rapide
et déterministe.

### 2. Contenu ancré dans le domaine et justification

**Migration Prisma** — `rationale String? @db.Text` sur `Topic` et sur
`Article`. Nullable : les sujets et articles déjà en base n'en ont pas, et un
article rédigé manuellement n'en aura jamais.

**Prompt** (`prompts/topics.prompt.ts`) — pour chaque sujet, exiger une
justification de 1 à 2 phrases ancrée dans *ce* domaine : audience visée,
mots-clés du domaine, manque à combler. Interdire explicitement les formules
génériques réutilisables sur n'importe quel domaine. Le bloc de contexte
éditorial (`buildDomainContextBlock`) est déjà injecté et reste inchangé.

**Parseur** (`parse-topics.ts`) — accepter `rationale`, `pourquoi` ou `why`
dans les objets JSON, selon le même principe de tolérance que `angle` /
`suggestedAngle` aujourd'hui. Les formes Markdown (titres H2, listes à puces)
restent des titres nus, sans justification : c'est une dégradation acceptée,
pas une erreur.

**Persistance** — `runTopicGenerationStep` écrit `rationale` sur chaque
`Topic` créé. `generateArticle` recopie la `rationale` du sujet sur
l'`Article` au moment de sa création.

**Exposition** — `rationale` sur les types GraphQL `Topic` et `Article`,
codegen régénéré, affichage sous le titre dans la liste des idées et dans
l'éditeur d'article.

### 3. Anti-répétition, à deux niveaux

Le prompt seul ne suffit pas (un modèle désobéit), le filtre seul non plus
(si le modèle repropose les mêmes sujets, on n'en garde aucun). Les deux :

**Niveau prompt** — `AITaskService.generateTopics` reçoit les titres déjà
proposés sur le domaine, **tous statuts confondus, rejetés inclus** : un
sujet écarté par l'équipe éditoriale ne doit pas revenir. Le prompt les
présente sous « Sujets déjà proposés, n'y reviens pas ».

**Niveau base** — à l'insertion, un comparateur écarte tout titre trop proche
d'un titre existant : normalisation (minuscules, accents et ponctuation
retirés, espaces réduits) puis similarité sur les mots.

**Résultat partiel** — le nombre de doublons écartés est tracé dans la sortie
de l'étape et remonté dans le suivi du pipeline. Si **tous** les sujets sont
écartés, l'étape échoue avec un message explicite plutôt que de rendre une
liste vide en silence. Aucune relance automatique : elle coûterait une minute
pour un gain incertain.

## Tests

**Unitaires** — `selectAIProvider('cli')` retourne bien `CliAgentProvider` ;
le prompt contient les titres existants et la consigne de justification ; le
parseur extrait `rationale` sous ses trois noms acceptés ; le comparateur de
doublons sur cas tabulaires (accents, casse, ponctuation, reformulation
proche, sujets légitimement distincts).

**Intégration** — le chemin de déduplication de `runTopicGenerationStep` via
le provider `fake`, y compris le cas « tous les sujets écartés ».

**Vérification réelle** — exécution en Docker avec opencode, sur un domaine
existant : les sujets produits parlent du domaine, diffèrent d'une génération
à l'autre, et portent une justification. Même méthode que pour le correctif
BullMQ : la suite verte ne remplace pas l'exécution réelle.

## Risques assumés

- **Latence.** Environ une minute par appel modèle. Un run d'article en fait
  deux (OUTLINE puis DRAFT) : ~2 minutes. `AI_CLI_TIMEOUT_MS=300000` couvre.
- **Instabilité du modèle gratuit.** `hy3-free` vient d'en faire la
  démonstration. Une panne fait passer l'étape en `FAILED` avec un message
  clair — comportement déjà en place, non modifié. Changer de modèle reste
  une variable d'environnement.
- **Taille de l'image worker.** Environ +100 Mo.
- **Qualité variable.** Un modèle gratuit produit un contenu moins bon qu'un
  modèle payant. La validation existante (`validateOutline`, seuil de 300
  mots côté SEO) reste la garde-fou ; ce lot ne la renforce pas.
