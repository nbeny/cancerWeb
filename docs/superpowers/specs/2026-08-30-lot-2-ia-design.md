# Lot 2 — IA — Design

Date : 2026-08-30
Statut : validé, prêt pour rédaction du plan
Socles : `2026-08-25-plateforme-editoriale-ia-design.md` (Lot 0), `2026-08-26-lot-1-editorial-design.md` (Lot 1) — tous deux livrés et fusionnés

---

## 1. Objectif

Brancher la génération automatique sur un modèle éditorial déjà éprouvé par un usage manuel. Le Lot 1 a délibérément construit Topics, Articles, versions et analyse SEO **sans aucune IA** : ce lot les alimente, sans changer les garanties déjà établies.

### Décisions cadrantes prises avec l'utilisateur

| Sujet | Décision | Raison |
|---|---|---|
| Périmètre du pipeline | `OUTLINE` → `DRAFT` → `SEO` seulement. `RESEARCH`, `ANALYSIS`, `FACT_CHECK`, `QUALITY` **sautées explicitement** | Aucun `ResearchProvider` réel avant le Lot 4. Une étape `FACT_CHECK` marquée réussie sans avoir rien vérifié serait un mensonge, et contredirait frontalement la contrainte « ne jamais présenter une information comme certaine sans source fiable » |
| Sortie structurée | Markdown de titres, parsé par `extractHeadings` | Un modèle écrit du Markdown bien plus fiablement que du JSON valide. Réutilise du code déjà testé sur 20 cas tordus, et le plan reste corrigeable à la main dans l'éditeur |
| Concurrence | **File d'attente visible**, avec position, estimation et annulation | L'utilisateur peut lancer dix articles et revenir plus tard, tout en sachant ce qui l'attend. Un refus aurait été plus simple mais aurait interdit ce cas d'usage |

---

## 2. Ce que ce lot ne change pas

Trois garanties du Lot 1 restent intactes et doivent le rester :

1. **L'IA ne calcule jamais le score SEO.** L'étape `SEO` du pipeline appelle l'analyseur déterministe existant. Un modèle ne peut pas être à la fois l'auteur et le juge — sinon le score cesse de mesurer quoi que ce soit.
2. **La séparation auteur/éditeur tient.** Le pipeline produit un article en `DRAFT` et le fait au mieux passer en `REVIEW`. Il n'atteint jamais `PUBLISHED`. L'IA hérite des droits de l'utilisateur qui déclenche la génération, jamais davantage.
3. **Toute écriture par l'IA est réversible.** `snapshotBeforeAutomatedChange`, écrit et testé au Lot 1 sans consommateur, devient le point d'entrée obligatoire de chaque écriture automatique.

---

## 3. Abstraction en deux niveaux

L'interface d'origine mélangeait mécanique de modèle et tâches métier. Y placer `generateArticle` obligerait chaque nouveau fournisseur à réimplémenter les prompts.

```ts
// Bas niveau — ce qu'un fournisseur sait faire. Seul point à réimplémenter.
export interface AIProvider {
  readonly key: string
  complete(req: CompletionRequest): Promise<CompletionResult>
  health(): Promise<ProviderHealth>
}

export interface CompletionRequest {
  prompt: string
  model?: string
  timeoutMs?: number
  correlationId?: string
}

export interface CompletionResult {
  text: string              // contenu utile, jamais du bruit de terminal
  raw?: string              // sortie brute tronquée, pour diagnostic
  durationMs: number
  promptTokens?: number     // null avec un provider CLI — assumé
  completionTokens?: number
  costCents?: number
}

// Haut niveau — le métier, écrit UNE fois au-dessus de l'interface.
export class AITaskService {
  generateTopics(domain: Domain, count: number): Promise<TopicDraft[]>
  generateOutline(domain: Domain, topic: Topic): Promise<Outline>
  generateDraft(domain: Domain, topic: Topic, outline: Outline): Promise<string>
}
```

Changer de fournisseur ne touche **aucun** code métier : `AIProvider` est injecté par token NestJS, sélectionné par `AI_PROVIDER`.

### Trois implémentations

- **`CliAgentProvider`** — `opencode`, validé en non-interactif dès le premier jour du projet (`docs/ai-cli-smoke-test.md`).
- **`FakeAIProvider`** — fixtures déterministes, latence et échecs simulables. **C'est lui qui tourne en CI** : sans lui, la suite serait lente, non reproductible, et dépendrait d'un binaire installé localement.
- **`HttpAIProvider`** — compatible OpenAI (Ollama, Groq, OpenRouter). Filet de sécurité si le CLI se révèle inexploitable ; ~80 lignes.

---

## 4. Contrat du provider CLI

Établi empiriquement, pas supposé. `opencode` n'expose ni `--prompt-file` ni `--output`.

```
<AI_WORKSPACE>/<jobId>/
  ├── prompt.md      # écrit par nous, transmis par STDIN
  ├── output.md      # écrit par l'agent, sur instruction explicite du prompt
  └── stderr.log     # log de diagnostic, JAMAIS parsé comme résultat
```

Décisions et leurs raisons :

- **`spawn` avec tableau d'arguments, jamais `shell: true`** : le prompt contient du contenu utilisateur ; une interpolation dans une chaîne de shell serait une injection de commande directe.
- **Prompt par stdin, pas en argument** : Windows limite la ligne de commande à environ 8 Ko ; un contexte d'article la dépasse. La variante stdin a été testée et fonctionne.
- **Stdout n'est jamais le résultat** : il contient des séquences ANSI et le commentaire d'exécution de l'agent (`Write output.md`, `Wrote file successfully`). Seul le fichier écrit fait foi.
- **Répertoire isolé par job**, supprimé après succès, conservé après échec pour diagnostic.
- **Timeout dur avec arrêt de l'arbre de processus** : un CLI attendant une entrée interactive est le mode de panne le plus probable de cette option.
- **Concurrence 1** : un agent CLI local n'est pas conçu pour des instances parallèles.
- **`promptTokens`, `completionTokens`, `costCents` restent `null`** : le CLI ne les fournit pas. L'observabilité est partielle et c'est assumé.

---

## 5. Sortie structurée sans JSON

`OUTLINE` demande un **plan en Markdown** — uniquement des titres et une ligne d'intention par section — puis le parse avec `parse()` et `extractHeadings()` du module `markdown/`.

```markdown
# Zero Trust en entreprise
## Pourquoi le périmètre ne suffit plus
## Les trois piliers
### Vérifier l'identité
### Valider l'appareil
## Par où commencer
## FAQ
```

**Pourquoi pas du JSON :** un agent CLI produit régulièrement du JSON approximatif — texte parasite avant l'accolade, virgule finale, guillemets typographiques — et chaque relance coûte une exécution complète de plusieurs secondes. Le Markdown de titres est plus tolérant, réutilise du code déjà éprouvé, et reste corrigeable à la main par l'utilisateur dans le même éditeur que l'article.

**Validation quand même nécessaire** : exactement un H1, au moins deux H2, pas de saut de niveau, longueur raisonnable. Un plan invalide déclenche **une** relance en renvoyant le défaut au modèle, puis échoue proprement — réessayer indéfiniment un modèle qui ne comprend pas brûle des minutes pour rien.

---

## 6. Pipeline

```
[lancement]
   └─ crée l'Article en DRAFT (visible immédiatement)
   └─ crée PipelineRun + PipelineStep(OUTLINE, PENDING)
   └─ enfile { runId, stepId, correlationId }

worker (concurrence 1)
   RESEARCH    → SKIPPED, raison persistée
   ANALYSIS    → SKIPPED
   OUTLINE     → IA, validation, snapshot avant écriture
   DRAFT       → IA, snapshot avant écriture
   FACT_CHECK  → SKIPPED, raison persistée
   SEO         → analyseur déterministe (aucune IA)
   QUALITY     → SKIPPED
   → WAITING_REVIEW
```

**Les étapes sautées sont persistées avec leur raison** et affichées comme telles dans l'interface. Un utilisateur doit voir « FACT_CHECK — non exécuté, aucun fournisseur de recherche » et non une case cochée.

**L'article est créé avant l'appel à l'IA**, en `DRAFT`. Il est donc visible immédiatement, et chaque écriture automatique est précédée d'un `snapshotBeforeAutomatedChange` : un plan raté ou une rédaction décevante se restaure depuis l'historique de versions du Lot 1.

**Reprise et rejeu** : `PipelineStep.output` est persisté ; relancer `DRAFT` crée un `attempt = 2` qui **lit l'`OUTLINE` déjà en base**. Aucune étape antérieure n'est recalculée. Au démarrage, le worker repasse en `PENDING` tout step resté `RUNNING` sans job actif dont le `heartbeatAt` est périmé.

---

## 7. File d'attente

```graphql
generateTopics(domainId: ID!, input: GenerateTopicsInput!): PipelineRun!
generateArticle(domainId: ID!, topicId: ID!): PipelineRun!
regenerateStep(domainId: ID!, runId: ID!, step: StepType!): PipelineRun!
cancelPipelineRun(domainId: ID!, runId: ID!): PipelineRun!

pipelineRun(domainId: ID!, id: ID!): PipelineRun
pipelineQueue(domainId: ID!): [QueuedRun!]!   # position, étape courante, attente estimée
aiJobs(domainId: ID!, filter: AIJobFilter, page: PageInput): AIJobConnection!
```

Toute opération IA retourne un `PipelineRun`, **jamais le résultat** : un appel de 90 secondes tomberait sur le timeout du proxy et ne serait pas rejouable.

**Estimation d'attente** : médiane des `AIJob.durationMs` passés, par type d'étape. Tant qu'aucun historique n'existe, l'interface affiche « estimation indisponible » plutôt qu'un chiffre inventé.

**Déduplication, malgré la file** : `jobId = ${stepId}:${attempt}` — BullMQ refuse un identifiant déjà présent, donc un double-clic ne produit pas deux articles. Relancer une génération sur un topic ayant déjà un run actif renvoie **ce run** plutôt que d'en créer un second.

**Annulation** : marque le run `CANCELLED` ; le handler vérifie ce drapeau entre chaque étape et tue le processus CLI en cours. Annuler un run en attente le retire simplement de la file.

---

## 8. Prompts

Un fichier par tâche dans `ai/prompts/`, versionné (`OUTLINE_V1`), avec injection systématique du contexte du domaine : ton, niveau d'expertise, audience, langue, `aiInstructions`, sujets exclus.

`AIJob.promptVersion` enregistre la version utilisée — sans quoi une variation de qualité serait inexplicable a posteriori.

**Les sujets exclus du domaine sont une contrainte, pas une suggestion** : le prompt les mentionne, et la validation de l'`OUTLINE` rejette un plan qui les aborde frontalement.

---

## 9. Interface

- **Écran de file** (`/dashboard/ai`) : exécutions en cours et en attente, position, étape, estimation, annulation.
- **Suivi d'une exécution** : les 7 étapes avec leur état — exécutée, sautée avec raison, en cours, échouée avec possibilité de relancer **cette étape seule**.
- **Génération d'idées** depuis un domaine : produit des `Topic` en statut `IDEA`, que l'utilisateur trie ensuite avec les écrans du Lot 1.
- **Bouton « Générer l'article »** depuis un topic `SELECTED`.

Suivi par **polling** toutes les 2 s sur `pipelineRun`, comme décidé au Lot 0 : les websockets imposeraient authentification sur socket, reconnexion et sessions persistantes derrière le proxy, pour afficher une barre de progression.

---

## 10. Tests

**Unitaires** : validation de l'outline (plan sans H1, deux H1, saut de niveau, sujet exclu abordé), construction des prompts, parsing de la sortie CLI, calcul de l'estimation d'attente.

**Intégration avec `FakeAIProvider`** : pipeline complet de bout en bout, reprise après crash simulé, rejeu d'une étape sans recalcul des précédentes, annulation en cours d'exécution, déduplication sur double-clic, file d'attente et positions, étapes sautées correctement tracées, snapshot créé avant chaque écriture automatique, et **l'IA n'atteint jamais `PUBLISHED`**.

**Test de fumée du vrai CLI** : exercice de `CliAgentProvider` contre `opencode`, **exclu de la CI** — il dépend d'un binaire local et de plusieurs dizaines de secondes par appel.

**E2E** : générer des idées, en choisir une, lancer la génération, voir la file, voir l'article se remplir, le relire, le soumettre en revue.

---

## 11. Ce que ce lot ne fait pas

Recherche web réelle et `ResearchProvider` (Lot 4), fact-checking sourcé (Lot 4), automatisations cron (Lot 4), blog public (Lot 3), génération d'images.

Dettes connues des lots précédents, non traitées ici : le job E2E de la CI n'a jamais tourné sur un runner GitHub ; `TransitionBar` duplique la table des rôles du serveur sans test de divergence.
