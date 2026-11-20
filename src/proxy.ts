import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '../utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  // Public content must remain available when authentication is slow.
  if (request.nextUrl.pathname === '/') return NextResponse.next()
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// Next.js 16 runs this before matching routes: it refreshes the Supabase
// session and sends signed-out visitors of private pages to sign in. 