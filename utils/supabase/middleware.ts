import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const AUTH_DEADLINE_MS = 4000

/** Pages that need a signed-in user. APIs verify identity themselves. */
export const PROTECTED_PATHS = ['/expense-intel', '/account']

export function isProtected(pathname: string) {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Send a signed-out visitor to sign in, then back to where they were going. */
function toLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
  return NextResponse.redirect(url)
}

export async function updateSession(request: NextRequest) {
  const guarded = isProtected(request.nextUrl.pathname)
  // Refresh only existing sessions. Sensitive handlers verify identity themselves.
  if (!request.cookies.getAll().some(({ name }) =>
    /^sb-.+-auth-token(?:\.\d+)?$/.test(name))) return guarded ? toLogin(request) : NextResponse.next()

  const controller = new AbortController()
  const pendingCookies = new Map<string, { name: string; value: string; options: CookieOptions }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          fetch: (input, init) => fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, controller.signal])
              : controller.signal,
          }),
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookies) {
            for (const cookie of cookies) {
              request.cookies.set(cookie.name, cookie.value)
              pendingCookies.set(cookie.name, cookie)
            }
          },
        },
      },
    )
    // Bound the whole operation, including SDK retry backoff.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('auth_deadline'))
      }, AUTH_DEADLINE_MS)
    })
    const { data, error } = await Promise.race([supabase.auth.getUser(), deadline])
    if (error && (!error.status || error.status >= 500)) throw error
    if (guarded && !data?.user) return toLogin(request)

    const response = NextResponse.next({ request: { headers: request.headers } })
    for (const { name, value, options } of pendingCookies.values()) {
      response.cookies.set(name, value, options)
    }
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    return new NextResponse('Authentication is temporarily unavailable. Please retry.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
    })
  } finally {
    if (timer) clearTimeout(timer)
    controller.abort()
  }
}
