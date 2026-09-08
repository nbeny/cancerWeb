import { NextRequest, NextResponse } from 'next/server'
import { domainSlugFromHost } from './lib/subdomain'

// Next.js 16 a renommé le fichier `middleware.ts` en `proxy.ts` (export nommé `proxy`) ;
// `middleware.ts` est marqué déprécié dans node_modules/next/dist/docs — voir
// 01-app/03-api-reference/03-file-conventions/proxy.md, section "Migration to Proxy".
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl

  // Un sous-domaine désigne un blog public : la requête est RÉÉCRITE (l'URL
  // affichée ne change pas) vers l'arbre `/blog/<slug>`, que personne ne
  // visite directement. Cette branche passe avant toute logique
  // d'authentification : un blog est lisible sans compte, et la racine
  // redirige sinon vers le tableau de bord (voir app/page.tsx), ce qui
  // enverrait un lecteur sur le back-office.
  const slug = domainSlugFromHost(request.headers.get('host'), process.env.PUBLIC_ROOT_HOST ?? 'localhost')
  if (slug) {
    const url = request.nextUrl.clone()
    url.pathname = `/blog/${slug}${pathname === '/' ? '' : pathname}`
    return NextResponse.rewrite(url)
  }

  // Hôte nu : back-office. Comportement inchangé, mais le matcher couvre
  // désormais toutes les routes, donc la garde ne doit s'appliquer qu'au
  // tableau de bord.
  if (!pathname.startsWith('/dashboard')) return NextResponse.next()

  const hasAccess = request.cookies.has('access')
  const hasRefresh = request.cookies.has('refresh')

  if (hasAccess) return NextResponse.next()

  // Access expiré mais refresh présent : tenter une rotation avant de renvoyer au login.
  if (hasRefresh) {
    const url = new URL('/api/auth/refresh', request.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }

  const login = new URL('/auth/login', request.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

// Élargi de `/dashboard/:path*` à tout, sauf les fichiers internes de Next,
// les routes d'API et les fichiers statiques : la résolution du sous-domaine
// doit voir la racine `/` et chaque page du blog, pas seulement le
// back-office.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
