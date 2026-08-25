import { NextRequest, NextResponse } from 'next/server'

// Next.js 16 a renommé le fichier `middleware.ts` en `proxy.ts` (export nommé `proxy`) ;
// `middleware.ts` est marqué déprécié dans node_modules/next/dist/docs — voir
// 01-app/03-api-reference/03-file-conventions/proxy.md, section "Migration to Proxy".
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
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

export const config = { matcher: ['/dashboard/:path*'] }
