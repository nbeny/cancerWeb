import { NextRequest, NextResponse } from 'next/server'
import { GraphQLClient } from 'graphql-request'
import { getSdk } from '@cancerweb/graphql'
import { safeNext } from '@/lib/safe-next'

const INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/graphql'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = safeNext(request.nextUrl.searchParams.get('next'), request.url)
  const cookieHeader = request.headers.get('cookie') ?? ''
  const login = new URL('/auth/login', request.url)

  try {
    const sdk = getSdk(new GraphQLClient(INTERNAL_URL, { headers: { cookie: cookieHeader } }))
    const result = await sdk.Refresh()

    const response = NextResponse.redirect(new URL(next, request.url))
    // Le Set-Cookie de l'API est reçu ici, côté serveur : il faut le relayer au navigateur.
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie)
    }
    return response
  } catch {
    return NextResponse.redirect(login)
  }
}
