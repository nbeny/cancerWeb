/**
 * Vérification de typage statique pour le SDK généré. Ce fichier n'exécute rien : il est compilé
 * par `tsc --noEmit` (script `typecheck`) pour prouver que les types générés mordent réellement.
 *
 * Pour vérifier qu'une régression de type serait bien détectée, décommenter temporairement la
 * ligne marquée ci-dessous doit faire échouer `pnpm --filter @cancerweb/graphql typecheck`.
 */
import { GraphQLClient } from 'graphql-request'
import { getSdk, type CreateDomainInput, type DomainFieldsFragment } from './generated'

// Tone / ExpertiseLevel sont générés comme unions de littéraux string (pas des enums TS) car
// typescript-operations les émet en mode "type-only" par défaut.
const input: CreateDomainInput = {
  name: 'Oncologie digestive',
  language: 'fr',
  tone: 'PROFESSIONAL',
  expertiseLevel: 'EXPERT',
}

const client = new GraphQLClient('http://localhost:4000/graphql')
const sdk = getSdk(client)

async function typeCheckOnly(): Promise<void> {
  const created = await sdk.CreateDomain({ input })
  const domain: DomainFieldsFragment = created.data.createDomain

  // Ligne volontairement fausse pour prouver que le typage mord — `country` est le seul champ
  // pays sur DomainFieldsFragment ; `countryCode` n'existe pas. Décommenter pour constater
  // l'erreur TS2551/TS2339, puis recommenter.
  // const bogus = domain.countryCode

  void domain
}

void typeCheckOnly
