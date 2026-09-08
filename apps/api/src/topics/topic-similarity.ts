/**
 * Deuxième barrière anti-redite, après la consigne du prompt
 * (`ai/prompts/topics.prompt.ts`) : un modèle peut reproposer un sujet
 * existant sous une autre formulation malgré l'interdiction. Ce module ne
 * connaît ni Prisma ni Nest — il ne compare que des chaînes.
 */

/**
 * Mots vides français retirés avant comparaison. Sans eux, « Les mots de
 * passe : bonnes pratiques » et « Bonnes pratiques des mots de passe »
 * partagent surtout des articles et des prépositions, ce qui écrase la
 * mesure de similarité au lieu de la porter.
 */
const STOP_WORDS = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'ces', 'cet', 'cette', 'd', 'dans', 'de',
  'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 'pour',
  'que', 'qui', 'sans', 'sur', 'un', 'une',
])

/**
 * Seuil de similarité de Jaccard au-delà duquel deux titres sont tenus pour
 * le même sujet. 0,7 sépare les cas observés : une reformulation par
 * réordonnancement atteint 1,0 une fois les mots vides retirés, tandis que
 * deux sujets d'un même thème mais de périmètre différent (« Zero Trust en
 * entreprise » / « Zero Trust pour les PME ») plafonnent à 0,5.
 */
const DUPLICATE_THRESHOLD = 0.7

/**
 * Plage Unicode des diacritiques combinants (accents, cédilles, tréma…) une
 * fois le titre décomposé en forme NFD. Les retirer après décomposition,
 * plutôt que de lister lettre à lettre les équivalences accentuées, couvre
 * tous les accents français sans entretenir une table de correspondance.
 */
const DIACRITICS_PATTERN = /[\u0300-\u036f]/g

/**
 * Élisions françaises (« l' », « d' », « qu'», etc.) à effacer avant que la
 * ponctuation ne soit réduite à des espaces. Sans ce traitement, « L'Immuno-
 * thérapie » se scinderait en deux tokens (« l » et « immunotherapie ») au
 * lieu de se réduire au seul mot porteur de sens : l'apostrophe deviendrait
 * un séparateur comme un autre et laisserait un « l » résiduel qui n'existe
 * dans aucune formulation alternative du même titre sans élision. La bordure
 * `\b` avant le groupe évite de mordre sur une occurrence interne, telle que
 * le « d' » d'« aujourd'hui », qui ne suit pas une frontière de mot.
 */
const ELISION_PATTERN = /\b(?:l|d|j|n|m|s|t|c|qu)['’]/g

/** Casse, accents, élisions, ponctuation et espaces multiples effacés. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .toLowerCase()
    .replace(ELISION_PATTERN, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function significantWords(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(' ').filter((word) => word.length > 0 && !STOP_WORDS.has(word)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * Vrai si `candidate` désigne le même sujet que l'un des `existing`. Un titre
 * identique après normalisation est toujours un doublon, même s'il n'est
 * composé que de mots vides (cas où `significantWords` renverrait un
 * ensemble vide et où la similarité vaudrait 0).
 */
export function isDuplicateTitle(candidate: string, existing: string[]): boolean {
  const normalized = normalizeTitle(candidate)
  const words = significantWords(candidate)

  return existing.some(
    (title) => normalizeTitle(title) === normalized || jaccard(words, significantWords(title)) >= DUPLICATE_THRESHOLD,
  )
}
