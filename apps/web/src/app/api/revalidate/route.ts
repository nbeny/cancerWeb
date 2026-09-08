import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { etiquetteDomaine, etiquetteSommaire } from '@/app/blog/[domainSlug]/blog-cache'
import { etiquetteArticle } from '@/app/blog/[domainSlug]/[articleSlug]/article-cache'

/**
 * `node:crypto` n'existe pas dans le runtime Edge : la route est explicitement
 * ancrée dans Node. C'est déjà le défaut de Next pour un route handler, mais
 * l'écrire empêche qu'un `export const runtime = 'edge'` posé un jour au
 * niveau du segment casse silencieusement la comparaison du secret.
 */
export const runtime = 'nodejs'

/** Doit rester identique à `REVALIDATE_SECRET_HEADER` côté API. */
const EN_TETE_SECRET = 'x-revalidate-secret'

/**
 * Plafond du corps accepté, en octets. La charge utile légitime fait une
 * centaine d'octets ; 1 Kio laisse une marge confortable tout en refusant
 * qu'un appelant fasse bufferiser des mégaoctets au processus Next.
 */
const TAILLE_MAX_CORPS = 1024

/**
 * Forme d'un slug, telle que la produit `slugify` côté API
 * (`apps/api/src/common/slug.ts` : minuscules, chiffres et tirets, rien
 * d'autre). La borne haute est plus large que les 80 caractères de `slugify`
 * parce que `uniqueSlug` suffixe les homonymes (`-1`, `-2`, ...) ; elle
 * garantit surtout que l'étiquette construite reste sous la limite de 256
 * caractères imposée par Next — au-delà, `revalidateTag` n'invaliderait RIEN,
 * silencieusement.
 */
const FORME_SLUG = /^[a-z0-9-]{1,128}$/

interface ChargeUtile {
  domainSlug: string
  articleSlug: string
}

function estSlug(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && FORME_SLUG.test(valeur)
}

/**
 * Le corps décodé a-t-il la forme attendue ? Du JSON syntaxiquement valide
 * n'est pas une charge utile valide : `{}`, `[]`, `null` ou un `domainSlug`
 * numérique arrivent tous ici et doivent repartir en 400 plutôt que de
 * produire une étiquette du genre `article-public:undefined:42`, qui
 * n'invaliderait rien et ne signalerait rien.
 */
function estChargeUtile(valeur: unknown): valeur is ChargeUtile {
  if (typeof valeur !== 'object' || valeur === null) return false
  const { domainSlug, articleSlug } = valeur as Record<string, unknown>
  return estSlug(domainSlug) && estSlug(articleSlug)
}

/**
 * Comparaison à temps constant du secret partagé.
 *
 * Les deux valeurs sont d'abord CONDENSÉES en SHA-256, pour deux raisons :
 *
 *  1. `timingSafeEqual` LÈVE une `RangeError` quand les deux tampons n'ont pas
 *     la même longueur, au lieu de renvoyer `false`. Un en-tête absent ou de
 *     taille différente ferait donc planter la route en 500 — un signal net,
 *     et gratuit, pour qui cherche la bonne longueur. Le condensé rend les
 *     deux tampons systématiquement longs de 32 octets ;
 *  2. c'est aussi ce qui empêche la longueur du secret de fuir par le temps de
 *     réponse, la comparaison portant désormais sur des condensés de taille
 *     fixe.
 *
 * Un en-tête absent est traité comme la chaîne vide : il emprunte exactement
 * le même chemin, le même travail et la même réponse 401 qu'un secret erroné.
 * Distinguer les deux (400 « en-tête manquant » d'un côté, 401 de l'autre)
 * confirmerait à un attaquant que le nom d'en-tête qu'il a deviné est le bon.
 */
function secretValide(fourni: string | null, attendu: string): boolean {
  const a = createHash('sha256').update(fourni ?? '', 'utf8').digest()
  const b = createHash('sha256').update(attendu, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * Webhook de revalidation du blog public, appelé par l'API à chaque
 * changement de statut qui franchit la frontière PUBLISHED (voir
 * `affectsPublicBlog` et `RevalidationService` côté API).
 *
 * Pourquoi `revalidateTag` et pas `revalidatePath` : `serverSdk` interroge
 * l'API en POST, et Next ne met jamais en cache un `fetch` POST — chaque
 * lecture publique est donc enveloppée dans un `unstable_cache` étiqueté
 * (voir `blog-cache.ts` et `article-cache.ts`). Invalider le CHEMIN laisserait
 * ces entrées intactes : la page serait re-rendue, mais à partir des mêmes
 * données mémorisées, et resterait figée indéfiniment.
 *
 * TROIS étiquettes, pas une seule :
 *
 *  - celle de l'article, la seule évidente ;
 *  - celle du SOMMAIRE, qui ne porte volontairement aucun numéro de page :
 *    publier décale tous les articles suivants d'une page à l'autre ;
 *  - celle du DOMAINE, parce que `publicDomain` répond `NOT_FOUND` pour un
 *    domaine sans aucun article publié : sans elle, la première publication
 *    d'un blog ne le sortirait jamais de son 404 (et la dernière
 *    dépublication ne l'y ferait jamais retomber).
 *
 * Les étiquettes sont CONSTRUITES par les fabriques exportées des modules de
 * cache, jamais retapées ici : une chaîne dupliquée qui diverge ne produit
 * aucune erreur, seulement un blog figé sans le moindre signal.
 *
 * SUR L'EXPOSITION DE CETTE ROUTE. `proxy.ts` exclut `api` de son matcher :
 * elle est donc joignable directement et n'est jamais réécrite vers
 * `/blog/<slug>`. Et elle n'est pas seulement joignable depuis le réseau du
 * conteneur : `docker/Caddyfile` ne détourne que `/graphql*`, `/health` et
 * `/uploads/*` vers l'API et relaie TOUT LE RESTE vers `web:3001` — ce
 * webhook est donc atteignable depuis l'extérieur, sur n'importe quel hôte
 * servi par le proxy. Le secret partagé est la SEULE chose qui le protège :
 * ni session, ni limite de débit (Next n'en offre pas nativement ; la poser
 * au niveau de Caddy serait le bon endroit, hors périmètre de cette tâche).
 *
 * D'où l'ordre des contrôles ci-dessous, qui n'est pas arbitraire : le secret
 * est vérifié AVANT que le corps ne soit lu, pour qu'un appelant non
 * authentifié ne puisse jamais faire bufferiser quoi que ce soit au
 * processus. Un refus coûte alors deux condensés SHA-256 et rien d'autre.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const attendu = process.env.REVALIDATE_SECRET
  // Sans secret configuré, toute comparaison serait faite contre la chaîne
  // vide — et un appelant qui n'envoie aucun en-tête serait AUTORISÉ. On
  // refuse donc en bloc. 503 et non 401 : c'est une panne de configuration de
  // ce service, pas un refus d'authentification, et la confondre avec un
  // mauvais secret coûterait des heures de diagnostic. L'aveu ne concède
  // rien — la route n'accepte personne dans cet état.
  if (!attendu) {
    console.error('[revalidate] REVALIDATE_SECRET absent de l’environnement : webhook désactivé')
    return NextResponse.json({ error: 'Revalidation indisponible' }, { status: 503 })
  }

  if (!secretValide(request.headers.get(EN_TETE_SECRET), attendu)) {
    // Aucun détail : ni « en-tête manquant », ni « secret incorrect ».
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // `content-length` d'abord, quand il est là : refuser sur l'annonce évite
  // de lire le corps du tout. Il est déclaratif (absent en `chunked`, et un
  // client hostile peut mentir), d'où la seconde mesure sur le corps réel.
  const annonce = Number(request.headers.get('content-length'))
  if (Number.isFinite(annonce) && annonce > TAILLE_MAX_CORPS) {
    return NextResponse.json({ error: 'Corps trop volumineux' }, { status: 413 })
  }

  const brut = await request.text()
  // `Buffer.byteLength` et non `.length` : ce dernier compte des unités
  // UTF-16, pas des octets, et laisserait passer près du double du plafond.
  if (Buffer.byteLength(brut, 'utf8') > TAILLE_MAX_CORPS) {
    return NextResponse.json({ error: 'Corps trop volumineux' }, { status: 413 })
  }

  let decode: unknown
  try {
    decode = JSON.parse(brut)
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  if (!estChargeUtile(decode)) {
    return NextResponse.json({ error: 'Corps invalide : domainSlug et articleSlug sont requis' }, { status: 400 })
  }

  const { domainSlug, articleSlug } = decode
  const etiquettes = [
    etiquetteArticle(domainSlug, articleSlug),
    etiquetteSommaire(domainSlug),
    etiquetteDomaine(domainSlug),
  ]

  // `{ expire: 0 }` plutôt que le profil `'max'` recommandé par défaut : ce
  // dernier sert le contenu périmé pendant un an pendant que la revalidation
  // tourne en arrière-plan, ce qui conviendrait à une mise à jour de contenu
  // mais pas à une DÉPUBLICATION — la page retirée resterait lisible, et
  // indexable. `{ expire: 0 }` force la prochaine requête à recalculer avant
  // de répondre. C'est la forme que la documentation de Next prescrit
  // justement pour un webhook, `updateTag` n'étant utilisable que depuis une
  // Server Action (voir node_modules/next/dist/docs/01-app/03-api-reference/
  // 04-functions/revalidateTag.md).
  for (const etiquette of etiquettes) {
    revalidateTag(etiquette, { expire: 0 })
  }

  return NextResponse.json({ revalidated: true, tags: etiquettes })
}
