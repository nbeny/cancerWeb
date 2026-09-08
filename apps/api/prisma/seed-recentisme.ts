/**
 * Seed du domaine éditorial « Récentisme ».
 *
 * Rejouable : tout passe par `upsert` (ou `findFirst` + `create` pour les
 * `Topic`, qui n'ont pas de contrainte d'unicité sur le titre). Relancer le
 * script ne duplique rien. Seuls les champs éditoriaux du `Domain` sont
 * réécrits à chaque exécution : ce sont eux qui alimentent les prompts IA
 * (voir `src/ai/prompts/domain-context.ts`), on veut pouvoir les faire
 * évoluer en modifiant ce fichier.
 *
 *   pnpm --filter @cancerweb/api exec dotenv -e ../../.env -- ts-node prisma/seed-recentisme.ts
 */
import {
  DomainRole,
  ExpertiseLevel,
  PrismaClient,
  SearchIntent,
  Tone,
  TopicStatus,
} from '@prisma/client'
import { slugify } from '../src/common/slug'

const prisma = new PrismaClient()

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'admin@cancerweb.local'

// Charte éditoriale injectée telle quelle dans les prompts `topics`,
// `outline` et `draft`. Le récentisme y est traité comme objet d'étude, jamais
// comme thèse à défendre : sans consigne explicite, un modèle sollicité sur
// « le récentisme » produit spontanément de la vulgarisation complaisante.
const AI_INSTRUCTIONS = [
  'Ligne éditoriale : ce blog traite le récentisme comme un OBJET D’ÉTUDE, jamais comme une thèse à défendre. Le cadre de référence est la chronologie établie par l’histoire et l’archéologie ; les thèses récentistes sont exposées, expliquées, puis évaluées.',
  '',
  'Règles de rédaction :',
  '- Exposer chaque thèse honnêtement avant de la discuter : auteur, ouvrage, année, et l’argument dans sa version la plus forte. Jamais d’homme de paille.',
  '- Séparer explicitement trois plans : ce que l’auteur affirme, ce que montrent les sources, ce qu’en dit la recherche. Ne jamais fondre les trois dans une même phrase.',
  '- Toute datation avancée doit être rattachée à une méthode nommée (carbone 14 calibré, dendrochronologie, thermoluminescence, archéomagnétisme, sources écrites, numismatique) et à ses marges d’erreur réelles. Jamais de date présentée comme un fait brut.',
  '- Citer des sources vérifiables et accessibles : publications académiques, éditions de sources, bases de données de datations. Pas de renvoi vague à « les historiens ».',
  '- Écrire pour un lecteur qui a croisé ces thèses en ligne et se pose sincèrement la question. Ton pédagogique, respectueux, jamais moqueur ni méprisant.',
  '- Expliquer les mécanismes de raisonnement en jeu (biais de confirmation, argument d’incrédulité, sélection des anomalies) plutôt que de disqualifier par étiquette.',
  '- Reconnaître les vraies zones d’incertitude de la chronologie ancienne quand elles existent : la solidité du consensus n’est pas l’infaillibilité.',
  '- Vocabulaire : dire « thèse récentiste » ou « chronologie révisée », jamais « théorie » au sens scientifique du terme pour ces propositions.',
  '- Structure attendue : accroche concrète, exposé de la thèse, examen des preuves, conclusion argumentée. Titres de sections informatifs, jamais allusifs.',
  '- Interdiction de conclure par « à vous de juger » ou toute autre fausse symétrie : conclure sur ce que les éléments établissent.',
].join('\n')

const CATEGORIES = [
  {
    slug: 'theses-recentistes',
    name: 'Les thèses',
    description: 'Exposé des systèmes récentistes : Fomenko, Illig, Hardouin, Topper et leurs héritiers.',
  },
  {
    slug: 'methodes-de-datation',
    name: 'Méthodes de datation',
    description: 'Comment on date réellement : carbone 14, dendrochronologie, thermoluminescence, archéomagnétisme.',
  },
  {
    slug: 'sources-et-documents',
    name: 'Sources et documents',
    description: 'Manuscrits, chartes, monnaies, inscriptions : ce que les sources permettent d’établir.',
  },
  {
    slug: 'astronomie-et-calendriers',
    name: 'Astronomie et calendriers',
    description: 'Éclipses, comètes, réforme grégorienne : l’argument astronomique et ses limites.',
  },
  {
    slug: 'historiographie',
    name: 'Histoire de l’historiographie',
    description: 'Scaliger, Denys le Petit, Petau : comment la chronologie moderne s’est construite.',
  },
  {
    slug: 'esprit-critique',
    name: 'Esprit critique',
    description: 'Biais, méthode et lecture critique : aborder une thèse alternative sans se faire piéger.',
  },
]

const TAGS = [
  'Fomenko',
  'Heribert Illig',
  'Jean Hardouin',
  'Uwe Topper',
  'Temps fantôme',
  'Carbone 14',
  'Dendrochronologie',
  'Scaliger',
  'Charlemagne',
  'Moyen Âge',
  'Byzance',
  'Archéologie',
  'Zététique',
  'Chronologie',
  'Éclipses',
  'Numismatique',
  'Paléographie',
  'Calendrier grégorien',
]

const TOPICS = [
  {
    title: 'Le récentisme, c’est quoi ? Guide de départ sur la chronologie révisée',
    description:
      'Article pilier qui définit le récentisme, distingue ses différentes familles (raccourcissement de la chronologie, siècles inventés, antiquité fabriquée) et cartographie ses principaux auteurs. Sert de page d’entrée vers tous les autres articles du domaine.',
    keywords: ['récentisme', 'chronologie révisée', 'révisionnisme chronologique', 'nouvelle chronologie', 'pseudo-histoire'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 3,
    estimatedInterest: 9,
    suggestedAngle:
      'Partir de la question naïve « et si l’histoire ancienne était plus courte qu’on le croit ? », puis montrer que ce n’est pas une seule thèse mais une famille de thèses concurrentes qui se contredisent entre elles — un fait rarement souligné et déjà très informatif.',
    rationale:
      'Requête de tête la plus large du domaine et seule porte d’entrée pour un lecteur qui découvre le terme. Sans cet article pilier, tous les autres sujets sont orphelins de contexte.',
  },
  {
    title: 'Les trois siècles qui n’auraient jamais existé : la thèse du temps fantôme d’Heribert Illig',
    description:
      'Exposé de l’hypothèse des siècles fantômes (614-911), de ses arguments (rareté archéologique du haut Moyen Âge, décalage du calendrier, figure de Charlemagne) et de leur confrontation aux données de datation et aux sources contemporaines.',
    keywords: ['Heribert Illig', 'temps fantôme', 'siècles fantômes', 'haut Moyen Âge', 'Charlemagne', '614-911'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 5,
    estimatedInterest: 9,
    suggestedAngle:
      'Prendre l’argument d’Illig au sérieux point par point, puis montrer où il casse : les datations dendrochronologiques d’édifices carolingiens, et les sources byzantines et arabes contemporaines qui devraient partager le même trou et ne le partagent pas.',
    rationale:
      'Version la plus médiatisée du récentisme en Europe et principal point d’entrée du grand public francophone. Fort volume de recherche, et l’objection dendrochronologique se démontre de façon très visuelle.',
  },
  {
    title: 'Anatoli Fomenko et la Nouvelle Chronologie : quand les statistiques prétendent réécrire l’histoire',
    description:
      'Présentation du système de Fomenko, de sa méthode de corrélation statistique des dynasties et de sa conclusion (l’histoire ancienne serait un doublon d’événements médiévaux). Analyse de la méthode elle-même : ce que mesure réellement la corrélation invoquée.',
    keywords: ['Anatoli Fomenko', 'nouvelle chronologie', 'corrélation dynastique', 'statistiques', 'histoire russe'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 6,
    estimatedInterest: 8,
    suggestedAngle:
      'Expliquer pourquoi un appareil mathématique impressionnant ne vaut pas mieux que les données qu’on lui donne : reconstituer la construction des séries dynastiques de Fomenko et montrer les choix arbitraires qui produisent mécaniquement les corrélations annoncées.',
    rationale:
      'Le système récentiste le plus élaboré et le plus cité ; c’est aussi le cas le plus pédagogique pour montrer qu’une méthode quantitative ne garantit pas un résultat solide.',
  },
  {
    title: 'Jean Hardouin, le jésuite qui tenait l’Antiquité pour un faux du Moyen Âge',
    description:
      'Portrait du premier récentiste connu : érudit reconnu et éditeur des conciles, Hardouin soutenait au XVIIIe siècle que la quasi-totalité des textes antiques avaient été fabriqués par des moines. Retour sur ses raisons et sur ce que sa carrière révèle du mécanisme.',
    keywords: ['Jean Hardouin', 'faux littéraires', 'philologie', 'XVIIIe siècle', 'critique des sources'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 4,
    estimatedInterest: 7,
    suggestedAngle:
      'Montrer que le récentisme n’est pas né d’Internet : Hardouin avait une compétence philologique réelle, ce qui rend d’autant plus instructif de comprendre où son raisonnement a dérapé.',
    rationale:
      'Donne de la profondeur historique au domaine, sur un angle peu couvert en français. Utile pour désamorcer l’idée que ces thèses seraient un phénomène récent lié aux réseaux sociaux.',
  },
  {
    title: 'Comment fonctionne vraiment la datation au carbone 14 (et ce qu’elle ne peut pas faire)',
    description:
      'Explication du principe, de la calibration par courbes IntCal, des marges d’erreur, des effets réservoir et de contamination. Puis examen des objections récentistes contre la méthode et de ce qu’elles supposeraient pour être vraies.',
    keywords: ['carbone 14', 'radiocarbone', 'calibration', 'IntCal', 'marge d’erreur', 'datation absolue'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 5,
    estimatedInterest: 8,
    suggestedAngle:
      'Assumer d’emblée les limites réelles de la méthode — elles existent et sont bien documentées — pour montrer ensuite qu’elles sont d’un tout autre ordre de grandeur que le décalage de plusieurs siècles postulé par le récentisme.',
    rationale:
      'Pièce technique de référence à laquelle tous les autres articles pourront renvoyer, et requête à fort volume qui dépasse largement le public récentiste.',
  },
  {
    title: 'La dendrochronologie, l’obstacle que le récentisme ne parvient pas à contourner',
    description:
      'Comment les séquences de cernes construisent une chronologie annuelle continue sur plusieurs millénaires, comment ces séquences sont recoupées entre régions et espèces, et pourquoi un décalage de trois siècles y serait immédiatement visible.',
    keywords: ['dendrochronologie', 'cernes', 'chronologie absolue', 'datation du bois', 'archéologie'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 6,
    estimatedInterest: 8,
    suggestedAngle:
      'Traiter la méthode comme une preuve par la contrainte : expliquer ce qu’il faudrait falsifier, et dans combien de laboratoires indépendants, pour que la thèse des siècles fantômes tienne.',
    rationale:
      'C’est l’objection décisive à la thèse d’Illig, et elle est rarement expliquée en détail en français. Fort potentiel de citation interne depuis les autres articles.',
  },
  {
    title: 'Charlemagne a-t-il existé ? Ce que disent les chartes, les monnaies et les fouilles',
    description:
      'Inventaire des traces matérielles et documentaires du règne carolingien : diplômes originaux, deniers d’argent, capitulaires, chapelle d’Aix, datations dendrochronologiques. Confrontation avec l’hypothèse d’un personnage inventé.',
    keywords: ['Charlemagne', 'carolingien', 'chartes', 'deniers', 'Aix-la-Chapelle', 'sources médiévales'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 5,
    estimatedInterest: 9,
    suggestedAngle:
      'Renverser la charge de la démonstration : au lieu de défendre l’existence de Charlemagne, énumérer concrètement tout ce qu’il aurait fallu fabriquer, et par qui, pour qu’elle soit fausse.',
    rationale:
      'Question virale et très recherchée, point d’entrée idéal pour un lecteur non spécialiste, avec des preuves matérielles faciles à illustrer.',
  },
  {
    title: 'Éclipses, comètes et chronologie : comment l’astronomie ancre l’histoire ancienne',
    description:
      'Le rôle des phénomènes astronomiques datables (éclipses assyriennes, comètes chinoises, canon des rois de Ptolémée) comme points fixes de la chronologie, et l’usage inverse qu’en fait le récentisme pour proposer des redatations.',
    keywords: ['éclipses', 'astronomie', 'canon de Ptolémée', 'comètes', 'datation astronomique', 'chronologie absolue'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 7,
    estimatedInterest: 7,
    suggestedAngle:
      'Expliquer pourquoi une éclipse est une contrainte si forte — position, heure, bande de totalité — et pourquoi les redatations récentistes obligent à retenir des candidates invisibles depuis le lieu décrit par la source.',
    rationale:
      'Sujet technique mais décisif : c’est le terrain sur lequel le récentisme prétend être le plus rigoureux, donc celui où la confrontation est la plus nette.',
  },
  {
    title: 'Joseph Scaliger et l’invention de la chronologie moderne',
    description:
      'Comment la chronologie universelle a été construite aux XVIe et XVIIe siècles, avec quelles sources et quelles hypothèses, et ce qui en a été corrigé depuis. Une mise au point utile face à l’argument récentiste d’une chronologie « décrétée ».',
    keywords: ['Joseph Scaliger', 'Denys le Petit', 'Petau', 'histoire de la chronologie', 'ère chrétienne'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 5,
    estimatedInterest: 6,
    suggestedAngle:
      'Accorder au récentisme son point de départ légitime — oui, la chronologie moderne a bien une histoire et un auteur — puis montrer les quatre siècles de vérifications indépendantes qui l’ont depuis testée et corrigée.',
    rationale:
      'Comble le principal angle mort des lecteurs : ils découvrent que la chronologie a été construite et en concluent qu’elle est arbitraire. Article de désamorçage.',
  },
  {
    title: 'Les dix jours disparus d’octobre 1582 ne prouvent rien de ce que le récentisme leur fait dire',
    description:
      'Reconstitution de la réforme grégorienne : pourquoi dix jours et pas treize, quel écart le calendrier julien accumulait réellement, et pourquoi ce chiffre est parfois présenté comme la preuve de siècles manquants.',
    keywords: ['calendrier grégorien', 'réforme grégorienne', '1582', 'calendrier julien', 'équinoxe', 'concile de Nicée'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 4,
    estimatedInterest: 8,
    suggestedAngle:
      'Refaire le calcul devant le lecteur, chiffres à l’appui, et montrer que l’écart de dix jours se déduit exactement du concile de Nicée en 325 — c’est-à-dire de la chronologie que la thèse prétend réfuter.',
    rationale:
      'Argument récentiste le plus répandu et le plus facilement vérifiable : l’article se conclut par une arithmétique que le lecteur peut refaire lui-même.',
  },
  {
    title: 'Anatomie d’un argument récentiste : comment une anomalie devient un système',
    description:
      'Décomposition du schéma de raisonnement commun à ces thèses : repérage d’une anomalie réelle, généralisation, hypothèse de fabrication massive, immunisation contre la réfutation. Illustré sur deux ou trois cas déjà traités sur le blog.',
    keywords: ['esprit critique', 'biais de confirmation', 'réfutabilité', 'méthode historique', 'zététique'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 5,
    estimatedInterest: 7,
    suggestedAngle:
      'Montrer le mécanisme plutôt que de le nommer : suivre un argument précis étape par étape jusqu’au moment exact où il cesse d’être vérifiable, et expliquer pourquoi ce moment est le point critique.',
    rationale:
      'Article transversal qui donne au lecteur un outil réutilisable au lieu d’une réponse ponctuelle, et qui fait le lien entre tous les cas particuliers du domaine.',
  },
  {
    title: 'Pourquoi les thèses récentistes séduisent autant',
    description:
      'Ce que ces thèses offrent à leurs lecteurs : une explication unifiée, un sentiment de lucidité, une défiance gratifiante envers l’autorité savante. Et ce que l’enseignement de l’histoire pourrait en tirer.',
    keywords: ['sociologie des croyances', 'défiance', 'vulgarisation', 'enseignement de l’histoire', 'esprit critique'],
    searchIntent: SearchIntent.INFORMATIONAL,
    estimatedDifficulty: 4,
    estimatedInterest: 7,
    suggestedAngle:
      'Prendre au sérieux l’attrait de ces thèses plutôt que de le déplorer : elles répondent à une curiosité réelle que la vulgarisation historique laisse souvent sans réponse.',
    rationale:
      'Angle réflexif qui élargit l’audience au-delà des passionnés de chronologie (enseignants, médiateurs scientifiques) et conclut naturellement la ligne éditoriale du domaine.',
  },
]

async function main(): Promise<void> {
  const domain = await prisma.domain.upsert({
    where: { slug: 'recentisme' },
    update: {},
    create: { name: 'Récentisme', slug: 'recentisme' },
  })

  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      name: 'Récentisme',
      description:
        'Enquête critique sur le récentisme, ce courant qui affirme que la chronologie de l’histoire ancienne et médiévale a été dilatée, voire fabriquée. On y expose les thèses (Fomenko, Illig, Hardouin, Topper), on les confronte aux méthodes de datation et aux sources, et on explique pourquoi elles ne tiennent pas — sans caricature ni complaisance.',
      language: 'fr',
      country: 'FR',
      tone: Tone.EDUCATIONAL,
      expertiseLevel: ExpertiseLevel.INTERMEDIATE,
      targetAudience: [
        'curieux d’histoire',
        'étudiants en histoire et en archéologie',
        'enseignants du secondaire',
        'amateurs de vulgarisation scientifique',
        'zététiciens et sceptiques',
        'lecteurs ayant croisé ces thèses en ligne',
      ],
      keywords: [
        'récentisme',
        'chronologie révisée',
        'révisionnisme chronologique',
        'nouvelle chronologie',
        'Anatoli Fomenko',
        'Heribert Illig',
        'Jean Hardouin',
        'Uwe Topper',
        'temps fantôme',
        'siècles fantômes',
        'Moyen Âge inventé',
        'Charlemagne',
        'datation au carbone 14',
        'dendrochronologie',
        'thermoluminescence',
        'archéomagnétisme',
        'stratigraphie',
        'numismatique',
        'paléographie',
        'faux et forgeries',
        'calendrier grégorien',
        'réforme grégorienne',
        'concile de Nicée',
        'ère chrétienne',
        'éclipses historiques',
        'datation astronomique',
        'canon de Ptolémée',
        'Joseph Scaliger',
        'Denys le Petit',
        'histoire de la chronologie',
        'historiographie',
        'sources médiévales',
        'annales et chroniques',
        'Byzance',
        'haut Moyen Âge',
        'pseudo-histoire',
        'esprit critique',
        'zététique',
        'méthode historique',
      ],
      // Contrainte absolue côté prompt : ces sujets ne doivent jamais être
      // abordés, même par allusion (voir `buildDomainContextBlock`). La liste
      // reste courte volontairement — tout ce qui y entre devient un angle
      // mort définitif pour la génération.
      excludedTopics: [
        'négationnisme de la Shoah',
        'théories racialistes ou identitaires',
        'polémique politique partisane',
        'attaques personnelles contre des personnes vivantes',
        'astrologie prédictive',
      ],
      aiInstructions: AI_INSTRUCTIONS,
      autoPublish: false,
      reviewOutline: true,
    },
  })

  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })
  if (owner) {
    await prisma.domainMember.upsert({
      where: { userId_domainId: { userId: owner.id, domainId: domain.id } },
      update: { role: DomainRole.OWNER },
      create: { userId: owner.id, domainId: domain.id, role: DomainRole.OWNER },
    })
  } else {
    console.warn(`Aucun utilisateur ${OWNER_EMAIL} : domaine créé sans membre OWNER.`)
  }

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { domainId_slug: { domainId: domain.id, slug: category.slug } },
      update: { name: category.name, description: category.description },
      create: { domainId: domain.id, ...category },
    })
  }

  for (const name of TAGS) {
    const slug = slugify(name)
    await prisma.tag.upsert({
      where: { domainId_slug: { domainId: domain.id, slug } },
      update: { name },
      create: { domainId: domain.id, name, slug },
    })
  }

  let created = 0
  for (const topic of TOPICS) {
    const existing = await prisma.topic.findFirst({
      where: { domainId: domain.id, title: topic.title },
      select: { id: true },
    })
    if (existing) continue
    await prisma.topic.create({
      data: { domainId: domain.id, status: TopicStatus.IDEA, ...topic },
    })
    created++
  }

  console.log(
    [
      `Domaine « ${domain.name} » (${domain.id}) prêt.`,
      `  OWNER          : ${owner?.email ?? 'aucun'}`,
      `  Catégories     : ${CATEGORIES.length}`,
      `  Tags           : ${TAGS.length}`,
      `  Sujets ajoutés : ${created} (sur ${TOPICS.length} définis)`,
    ].join('\n'),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
