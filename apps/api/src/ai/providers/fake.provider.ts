import { Injectable } from '@nestjs/common'
import type { AIProvider, CompletionRequest, CompletionResult, ProviderHealth } from '../ai.types'

/**
 * Marqueurs reconnus dans le prompt. Le service métier (Task 3) place l'un
 * d'eux dans le prompt qu'il construit ; ce provider ne connaît rien du
 * domaine, il ne fait que retourner la fixture correspondante. C'est ce
 * découplage qui permet au pipeline de tourner en CI sans jamais appeler un
 * vrai modèle.
 */
const MARKERS = ['OUTLINE', 'DRAFT', 'TOPICS'] as const
type Marker = (typeof MARKERS)[number]

// Plan Markdown valide : un seul H1, plusieurs H2, un H3 imbriqué — de quoi
// exercer `validateOutline` (Task 3) sur un cas nominal.
const VALID_OUTLINE_MD = `# Comprendre l'immunothérapie moderne

## Qu'est-ce que l'immunothérapie ?

## Les principaux types de traitements

### Inhibiteurs de points de contrôle

### Thérapies cellulaires CAR-T

## Bénéfices et limites actuelles

## Perspectives de recherche
`

// Plan délibérément invalide (deux H1) pour tester la relance de
// `AITaskService.generateOutline` sur un plan qui ne respecte pas le contrat.
const INVALID_OUTLINE_MD = `# Comprendre l'immunothérapie moderne

## Qu'est-ce que l'immunothérapie ?

# Les principaux types de traitements

## Bénéfices et limites actuelles
`

// Brouillon Markdown plausible de plus de 300 mots (l'analyseur SEO réel
// bloque en dessous de ce seuil) : le pipeline doit pouvoir l'enchaîner sans
// retour à zéro.
const VALID_DRAFT_MD = `# Comprendre l'immunothérapie moderne

L'immunothérapie a profondément transformé la prise en charge de nombreux cancers au cours de la dernière décennie. Plutôt que d'attaquer directement les cellules tumorales comme le font la chimiothérapie ou la radiothérapie, cette approche mobilise le système immunitaire du patient lui-même pour qu'il reconnaisse et détruise les cellules cancéreuses. Ce changement de paradigme a ouvert des perspectives de rémission durable pour des patients qui, il y a encore quinze ans, disposaient de très peu d'options thérapeutiques une fois la maladie avancée.

## Qu'est-ce que l'immunothérapie ?

Le système immunitaire dispose naturellement de mécanismes de surveillance capables de détecter des cellules anormales. Les tumeurs développent cependant des stratégies pour échapper à cette surveillance, notamment en activant des "points de contrôle immunitaires", des freins moléculaires qui empêchent les lymphocytes T de les attaquer. L'immunothérapie moderne cible précisément ces mécanismes d'échappement pour restaurer la capacité du corps à combattre la maladie par lui-même, plutôt que d'introduire un agent toxique externe.

## Les principaux types de traitements

Plusieurs familles de traitements coexistent aujourd'hui, chacune avec un mode d'action distinct et des indications propres.

### Inhibiteurs de points de contrôle

Ces molécules bloquent des protéines comme PD-1, PD-L1 ou CTLA-4, qui agissent normalement comme des freins sur la réponse immunitaire. En levant ce frein, elles permettent aux lymphocytes T de reconnaître et d'attaquer plus efficacement les cellules tumorales. Ils sont aujourd'hui utilisés dans le mélanome, le cancer du poumon et de nombreuses autres localisations.

### Thérapies cellulaires CAR-T

Cette approche consiste à prélever les lymphocytes T d'un patient, à les modifier génétiquement en laboratoire pour qu'ils expriment un récepteur capable de reconnaître un antigène tumoral spécifique, puis à les réinjecter en grand nombre. Les résultats obtenus dans certains cancers du sang ont été spectaculaires, avec des rémissions durables chez des patients en échec de tous les traitements précédents.

## Bénéfices et limites actuelles

Les bénéfices sont réels : des réponses durables, parfois après l'arrêt du traitement, et un profil de tolérance globalement différent de celui des chimiothérapies classiques. Ces traitements ne sont cependant pas dénués de risques : ils peuvent déclencher des réactions auto-immunes sévères, puisqu'ils lèvent des freins qui protègent aussi les tissus sains. Leur coût élevé et leur disponibilité inégale selon les systèmes de santé restent également des obstacles majeurs à un accès équitable.

## Perspectives de recherche

La recherche actuelle explore des combinaisons entre immunothérapies et traitements plus classiques, ainsi que des biomarqueurs permettant de prédire à l'avance quels patients répondront le mieux. L'objectif est de transformer une approche encore largement empirique en une médecine de précision, où le traitement est choisi en fonction du profil immunitaire propre à chaque tumeur plutôt que de sa seule localisation anatomique.
`

const TOPICS_FIXTURE = JSON.stringify(
  [
    { title: "Comprendre l'immunothérapie moderne", angle: 'vulgarisation, patients nouvellement diagnostiqués' },
    { title: 'Nutrition et traitements du cancer : ce que dit la science', angle: 'mythes vs preuves' },
    { title: 'Vivre avec un cancer chronique : organiser le quotidien', angle: 'aidants et patients' },
  ],
  null,
  2,
)

const FIXTURES: Record<Marker, () => string> = {
  OUTLINE: () => VALID_OUTLINE_MD,
  DRAFT: () => VALID_DRAFT_MD,
  TOPICS: () => TOPICS_FIXTURE,
}

function extractMarker(prompt: string): Marker | undefined {
  return MARKERS.find((marker) => prompt.includes(`[[${marker}]]`))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Provider déterministe destiné à tourner en CI et en développement local.
 * C'est le provider le plus important du lot : sans lui, la suite
 * d'intégration du pipeline serait lente, instable et dépendrait d'un
 * binaire installé sur la machine qui l'exécute.
 *
 * Toute sa configuration (latence simulée, étape à faire échouer, plan
 * invalide) passe par des variables d'environnement lues à chaque appel,
 * jamais mises en cache à la construction : les tests d'intégration du
 * pipeline doivent pouvoir faire varier ce comportement d'un run à l'autre
 * sans reconstruire le provider.
 */
@Injectable()
export class FakeAIProvider implements AIProvider {
  readonly key = 'fake'

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const start = Date.now()

    const latencyMs = Number(process.env.AI_FAKE_LATENCY_MS ?? '0')
    if (latencyMs > 0) {
      await sleep(latencyMs)
    }

    const marker = extractMarker(req.prompt)
    if (!marker) {
      throw new Error(
        `FakeAIProvider : aucun marqueur reconnu dans le prompt (attendu l'un de ${MARKERS.map((m) => `[[${m}]]`).join(', ')})`,
      )
    }

    const failStep = process.env.AI_FAKE_FAIL_STEP
    if (failStep && failStep === marker) {
      throw new Error(`FakeAIProvider : échec simulé pour l'étape ${marker} (AI_FAKE_FAIL_STEP=${failStep})`)
    }

    const text =
      marker === 'OUTLINE' && process.env.AI_FAKE_INVALID_OUTLINE === '1' ? INVALID_OUTLINE_MD : FIXTURES[marker]()

    return {
      text,
      raw: text,
      durationMs: Date.now() - start,
    }
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true }
  }
}
