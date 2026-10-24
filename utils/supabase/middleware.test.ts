import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { create, getUser } = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: create }))
import { updateSession, AUTH_DEADLINE_MS } from './middleware'
import { middleware } from '../../middleware'

const request = (path = '/account', cookie = true) => new NextRequest(`https://app.example${path}`, {
  headers: cookie ? { cookie: 'sb-project-auth-token.0=synthetic' } : {},
})

describe('session refresh availability', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    create.mockReturnValue({ auth: { getUser } })
    getUser.mockResolvedValue({ error: null })
  })
  afterEach(() => vi.useRealTimers())

  it('does not contact auth for public landing even with a session cookie', async () => {
    expect((await middleware(request('/'))).status).toBe(200)
    expect(create).not.toHaveBeenCalled()
  })
  it('does not refresh absent sessions', async () => {
    expect((await updateSession(request('/account', false))).status).toBe(200)
    expect(create).not.toHaveBeenCalled()
  })
  it('preserves all cookie mutations across refresh batches', async () => {
    getUser.mockImplementation(async () => {
      const cookies = create.mock.calls[0][2].cookies
      cookies.setAll([{ name: 'sb-project-auth-token.0', value: 'new', options: { httpOnly: true } }])
      cookies.setAll([{ name: 'sb-project-auth-token.1', value: 'part2', options: { secure: true } }])
      return { error: null }
    })
    const req = request()
    const response = await updateSession(req)
    expect(response.cookies.get('sb-project-auth-token.0')?.value).toBe('new')
    expect(response.cookies.get('sb-project-auth-token.1')?.value).toBe('part2')
    expect(req.cookies.get('sb-project-auth-token.1')?.value).toBe('part2')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it('returns bounded unavailable response and aborts hanging transport', async () => {
    vi.useFakeTimers()
    getUser.mockReturnValue(new Promise(() => {}))
    const pending = updateSession(request())
    await vi.advanceTimersByTimeAsync(AUTH_DEADLINE_MS)
    const response = await pending
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('x-middleware-next')).toBeNull()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    await create.mock.calls[0][2].global.fetch('https://auth.example')
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    fetchMock.mockRestore()
  })
  it('does not continue a request when auth is unavailable', async () => {
    getUser.mockResolvedValue({ error: { status: 503 } })
    expect((await updateSession(request())).status).toBe(503)
  })
  it('allows normal invalid-session handling without treating it as an outage', async () => {
    getUser.mockResolvedValue({ error: { status: 401 } })
    expect((await updateSession(request())).status).toBe(200)
  })
})
