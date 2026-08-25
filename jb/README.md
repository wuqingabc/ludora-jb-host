# Ludora JB Host

`/jb` is the protected browser entry for Ludora console users. It intentionally
keeps the exploit UI behind an authorization handshake:

1. PS4/PS5 browser opens `/jb`.
2. The page classifies the console from `User-Agent`.
3. `POST /api/jb/sessions` creates a short-lived session and returns a mobile
   URL, authorization code, and QR data URL.
4. The phone authorizes the session using the code.
5. The console polls `GET /api/jb/sessions/:id` and redirects to `/jb/ps4/` or
   `/jb/ps5/` only after authorization.

The phone page is `/jb/authorize.html?session=:id` and calls
`POST /api/jb/sessions/:id/authorize` with `{ authorizationCode }`.

The API must bind the session to the console cookie, expire sessions quickly,
rate-limit code attempts, and return `authorized: true` only after a valid
entitlement check. The exploit assets remain upstream-compatible and are not
loaded until the redirect.

For desktop UI review only, use `/jb/?preview=1` or
`/jb/?preview=1&platform=ps5`. This bypass is query-gated and must not be used
as the production authorization path.

The authorization UI and every protected Host page accept `?lang=zh-CN`,
`?lang=zh-TW`, and `?lang=en-US`. The default is `zh-CN`; the selected locale
is retained locally and carried from the phone authorization handoff to the
final Host entry.
