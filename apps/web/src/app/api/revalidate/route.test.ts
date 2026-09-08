// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

/**
 * `revalidateTag` n'existe qu'à l'intérieur d'un rendu Next (elle écrit dans
 * le magasin de travail de la requête) et lèverait ici. Elle est donc doublée,
 * ce qui a un second mérite : le test peut affirmer QUELLES étiquettes sont
 * invalidées, ce qu'aucune autre observation ne permettrait — une étiquette
 * oubliée ne produit aucune erreur, seulement une page figée.
 *
 * `vi.hoisted` : `vi.mock` est remontée en tête de module par Vitest, avant
 * les déclarations, et sa fabrique ne peut donc pas fermer sur un `const`
 * ordinaire. Le reste du module (`unstable_cache`, dont dépendent les modules
 * de cache importés par la route) est conservé tel quel.
 */
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  revalidateTag,
}))

const SECRET = 'un-secret-de-test-suffisamment-long'
const EN_TETE = 'x-revalidate-secret'

const requete = (corps: string, entetes: Record<string, string> = {}) =>
  new NextRequest('http://web:3001/api/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: corps,
  })

const charge = (corps: string) => requete(corps, { [EN_TETE]: SECRET })

let secretInitial: string | undefined

beforeEach(() => {
  secretInitial = process.env.REVALIDATE_SECRET
  process.env.REVALIDATE_SECRET = SECRET
  revalidateTag.mockClear()
})

afterEach(() => {
  if (secretInitial === undefined) delete process.env.REVALIDATE_SECRET
  else process.env.REVALIDATE_SECRET = secretInitial
})

describe('POST /api/revalidate', () => {
  describe('secret', () => {
    it('refuse un secret erroné en 401, sans invalider quoi que ce soit', async () => {
      const reponse = await POST(requete('{"domainSlug":"cyber","articleSlug":"art"}', { [EN_TETE]: 'mauvais' }))

      expect(reponse.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it("refuse un en-tête ABSENT avec la même réponse qu'un secret erroné", async () => {
      // `timingSafeEqual` lève sur deux tampons de tailles différentes : sans
      // le condensé préalable, ce cas serait un 500, signal exploitable. Et la
      // réponse doit être indiscernable de celle d'un mauvais secret, sans
      // quoi un attaquant apprendrait que le nom d'en-tête est le bon.
      const sansEntete = await POST(requete('{"domainSlug":"cyber","articleSlug":"art"}'))
      const mauvais = await POST(requete('{"domainSlug":"cyber","articleSlug":"art"}', { [EN_TETE]: 'mauvais' }))

      expect(sansEntete.status).toBe(401)
      expect(await sansEntete.json()).toEqual(await mauvais.json())
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('refuse un secret de longueur différente sans lever', async () => {
      const reponse = await POST(requete('{"domainSlug":"cyber","articleSlug":"art"}', { [EN_TETE]: 'x' }))

      expect(reponse.status).toBe(401)
    })

    it("répond 503 — jamais 200 — quand REVALIDATE_SECRET n'est pas configuré", async () => {
      // Sans cette garde, la comparaison se ferait contre la chaîne vide et un
      // appelant SANS en-tête serait autorisé.
      delete process.env.REVALIDATE_SECRET
      const erreur = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const reponse = await POST(requete('{"domainSlug":"cyber","articleSlug":"art"}'))

      expect(reponse.status).toBe(503)
      expect(revalidateTag).not.toHaveBeenCalled()
      expect(erreur).toHaveBeenCalled()
      erreur.mockRestore()
    })
  })

  describe('corps', () => {
    it('refuse un corps qui n’est pas du JSON en 400', async () => {
      const reponse = await POST(charge('pas du json'))

      expect(reponse.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it.each([
      ['objet vide', '{}'],
      ['null', 'null'],
      ['tableau', '[]'],
      ['slug numérique', '{"domainSlug":42,"articleSlug":"art"}'],
      ['articleSlug manquant', '{"domainSlug":"cyber"}'],
      ['slug vide', '{"domainSlug":"","articleSlug":"art"}'],
      ['slug avec majuscules et espaces', '{"domainSlug":"Cyber Sécurité","articleSlug":"art"}'],
      ['slug avec deux-points (injection d’étiquette)', '{"domainSlug":"a:b","articleSlug":"art"}'],
    ])('refuse un JSON valide mais de mauvaise forme (%s) en 400', async (_cas, corps) => {
      const reponse = await POST(charge(corps))

      expect(reponse.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('refuse un corps hors gabarit en 413, sans le décoder', async () => {
      const enorme = JSON.stringify({ domainSlug: 'cyber', articleSlug: 'a'.repeat(4096) })

      const reponse = await POST(charge(enorme))

      expect(reponse.status).toBe(413)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('refuse sur la seule ANNONCE de taille, sans lire le corps', async () => {
      // `content-length` est déclaratif — un client peut mentir, d'où la
      // seconde mesure sur le corps réel — mais quand il est là et qu'il
      // annonce l'inacceptable, autant ne rien lire du tout.
      const reponse = await POST(
        requete('{"domainSlug":"cyber","articleSlug":"art"}', {
          [EN_TETE]: SECRET,
          'content-length': '1048576',
        }),
      )

      expect(reponse.status).toBe(413)
      expect(revalidateTag).not.toHaveBeenCalled()
    })
  })

  describe('invalidation', () => {
    it('invalide les TROIS étiquettes : article, sommaire et domaine', async () => {
      const reponse = await POST(charge('{"domainSlug":"cyber","articleSlug":"mon-article"}'))

      expect(reponse.status).toBe(200)
      expect(await reponse.json()).toEqual({
        revalidated: true,
        tags: ['article-public:cyber:mon-article', 'sommaire-public:cyber', 'domaine-public:cyber'],
      })
      // Le sommaire parce qu'une publication décale tous les articles suivants
      // d'une page à l'autre ; le domaine parce que `publicDomain` répond
      // NOT_FOUND tant qu'aucun article n'est publié — sans lui, le premier
      // article d'un blog ne le sortirait jamais de son 404.
      expect(revalidateTag.mock.calls.map(([etiquette]) => etiquette)).toEqual([
        'article-public:cyber:mon-article',
        'sommaire-public:cyber',
        'domaine-public:cyber',
      ])
    })

    it('force l’expiration immédiate plutôt que de servir du périmé', async () => {
      await POST(charge('{"domainSlug":"cyber","articleSlug":"mon-article"}'))

      // Le profil `'max'` sert le contenu périmé pendant un an : acceptable
      // pour une mise à jour, inacceptable pour une dépublication — la page
      // retirée resterait lisible et indexable.
      expect(revalidateTag).toHaveBeenCalledTimes(3)
      for (const [, profil] of revalidateTag.mock.calls) {
        expect(profil).toEqual({ expire: 0 })
      }
    })
  })
})
