// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { proxy } from './proxy'

/**
 * `proxy` décide, pour CHAQUE requête du site, si le visiteur voit un blog
 * public ou le back-office authentifié : les deux directions sont couvertes
 * ici, pas seulement le chemin heureux. L'élargissement du matcher à tout le
 * site rend en effet l'erreur silencieuse — soit `/dashboard` cesse d'être
 * protégé, soit plus rien n'est joignable, et dans les deux cas le typecheck
 * passe.
 */
describe('proxy', () => {
  const ROOT = 'localhost'
  let rootHostInitial: string | undefined

  beforeEach(() => {
    rootHostInitial = process.env.PUBLIC_ROOT_HOST
    process.env.PUBLIC_ROOT_HOST = ROOT
  })

  afterEach(() => {
    if (rootHostInitial === undefined) delete process.env.PUBLIC_ROOT_HOST
    else process.env.PUBLIC_ROOT_HOST = rootHostInitial
  })

  /** `NextResponse.rewrite` et `redirect` s'expriment par des en-têtes internes. */
  const reecriture = (reponse: Response) => reponse.headers.get('x-middleware-rewrite')
  const passePlat = (reponse: Response) => reponse.headers.get('x-middleware-next') === '1'

  const requete = (url: string, host: string, cookie?: string) =>
    new NextRequest(url, { headers: cookie ? { host, cookie } : { host } })

  describe('sous-domaine (blog public)', () => {
    it('réécrit la racine vers /blog/<slug> sans y ajouter de segment vide', () => {
      const reponse = proxy(requete('http://cybersecurite.localhost:3000/', 'cybersecurite.localhost:3000'))

      expect(reponse.status).toBe(200)
      expect(reecriture(reponse)).toBe('http://cybersecurite.localhost:3000/blog/cybersecurite')
    })

    it('conserve le chemin et la query sous /blog/<slug>', () => {
      const reponse = proxy(
        requete(
          'http://cybersecurite.localhost:3000/articles/phishing?page=2',
          'cybersecurite.localhost:3000',
        ),
      )

      expect(reecriture(reponse)).toBe(
        'http://cybersecurite.localhost:3000/blog/cybersecurite/articles/phishing?page=2',
      )
    })

    it("réécrit avant la garde d'authentification : un blog est lisible sans cookie", () => {
      // Même sur `/dashboard`, le sous-domaine l'emporte : sinon un lecteur
      // sans compte serait renvoyé vers /auth/login au lieu du blog.
      const reponse = proxy(requete('http://cybersecurite.localhost:3000/dashboard', 'cybersecurite.localhost:3000'))

      expect(reponse.status).toBe(200)
      expect(reecriture(reponse)).toContain('/blog/cybersecurite/dashboard')
    })

    it('suit PUBLIC_ROOT_HOST plutôt qu’un domaine racine codé en dur', () => {
      process.env.PUBLIC_ROOT_HOST = 'exemple.fr'
      const reponse = proxy(requete('http://cybersecurite.exemple.fr/', 'cybersecurite.exemple.fr'))

      expect(reecriture(reponse)).toBe('http://cybersecurite.exemple.fr/blog/cybersecurite')
    })
  })

  describe('hôte nu (back-office)', () => {
    it('laisse passer la racine : le matcher élargi ne doit rien garder de plus', () => {
      const reponse = proxy(requete('http://localhost:3000/', 'localhost:3000'))

      expect(passePlat(reponse)).toBe(true)
      expect(reecriture(reponse)).toBeNull()
    })

    it('laisse passer une page publique hors /dashboard', () => {
      const reponse = proxy(requete('http://localhost:3000/auth/login', 'localhost:3000'))

      expect(passePlat(reponse)).toBe(true)
    })

    it('renvoie vers /auth/login sur /dashboard sans cookie', () => {
      const reponse = proxy(requete('http://localhost:3000/dashboard/domaines', 'localhost:3000'))

      expect(reponse.status).toBe(307)
      expect(reponse.headers.get('location')).toBe(
        'http://localhost:3000/auth/login?next=%2Fdashboard%2Fdomaines',
      )
    })

    it('tente une rotation quand seul le cookie refresh subsiste', () => {
      const reponse = proxy(
        requete('http://localhost:3000/dashboard/domaines?onglet=seo', 'localhost:3000', 'refresh=jeton'),
      )

      expect(reponse.status).toBe(307)
      expect(reponse.headers.get('location')).toBe(
        'http://localhost:3000/api/auth/refresh?next=%2Fdashboard%2Fdomaines%3Fonglet%3Dseo',
      )
    })

    it('laisse passer /dashboard avec un cookie access', () => {
      const reponse = proxy(requete('http://localhost:3000/dashboard', 'localhost:3000', 'access=jeton'))

      expect(passePlat(reponse)).toBe(true)
    })
  })

  it("ne réécrit pas un sous-domaine imbriqué : il retombe sur le back-office", () => {
    // `domainSlugFromHost` refuse `a.b.localhost` ; la garde /dashboard
    // s'applique alors normalement.
    const reponse = proxy(requete('http://a.b.localhost:3000/dashboard', 'a.b.localhost:3000'))

    expect(reponse.status).toBe(307)
    expect(reponse.headers.get('location')).toContain('/auth/login')
  })
})
