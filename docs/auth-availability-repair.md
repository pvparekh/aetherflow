# Authentication availability repair

The public landing previously waited for a middleware user lookup and then
rendered nothing until a second client-side session lookup completed. The
owner reported intermittent MIDDLEWARE_INVOCATION_TIMEOUT responses. That
exact production failure was not reproduced in anonymous diagnostic checks.

This change removes the landing page's middleware dependency on Auth and
renders public content before optional personalization. The login button's
browser client is initialized in an effect, so static rendering needs no
Supabase connection and does not restart its lookup on each render.

Other routes refresh existing default Supabase session cookies. Requests
without those cookies continue normally; this does not authorize them.
Existing sensitive API handlers still validate the user server-side.
Custom cookie names would require updating the session-cookie detection.

Middleware refresh has a four-second total deadline, including SDK retry
backoff. Outgoing fetches receive an abort signal. Provider failures return
a retryable, non-cacheable 503 instead of continuing a session-bearing
request without verification. Ordinary invalid-session errors are left to
normal downstream authentication handling. All refreshed cookie chunks are
propagated together into the request and response, including across batches.

## Validation

Six mocked regression tests cover public bypass, absent sessions, multiple
cookie batches, hung authentication with abort, unavailable authentication,
and normal invalid-session handling. Existing stats tests are retained.
These do not establish that an actual expired owner session was tested.
TypeScript, targeted ESLint and the production build must also pass.

Before production promotion, verify sign-in, token refresh, logout, auth
callback, protected endpoints and public deep-link refresh on the candidate
deployment. Include a two-cookie refresh scenario and verify anonymous
requests cannot read private records. The existing repo-wide lint script
uses unsupported `next lint` under Next 16; it is outside this scoped repair.

Rollback: revert this commit and redeploy the previous known-good build.
No database, environment, domain, permission or model changes are required.
