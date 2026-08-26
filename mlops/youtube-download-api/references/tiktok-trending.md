# GET /tiktok/trending (TikWM proxy)

Self-hosted proxy in `tiktok.js`, wired from `server.js`. No extra npm deps.

## Call

```
GET https://api.saturia.codes/tiktok/trending?region=ID&count=12&cursor=0
```

| param  | default | rules                                      |
|--------|---------|--------------------------------------------|
| region | `ID`    | ISO 3166-1 alpha-2 only (`/^[A-Za-z]{2}$/`). Uppercased. `USA` → 400 `Invalid region`. |
| count  | `12`    | clamped 1–30                               |
| cursor | `0`     | pagination offset, ≥ 0                     |

Success 200: `{ success, count, region, cursor, videos[] }`.
Upstream fail → 502 `{ error }`. Bad region → 400.

Each video keeps TikWM fields; `play` / `wmplay` / `cover` / `music` / `url`
rewritten via `new URL(path, 'https://tikwm.com')` so relative paths become
absolute. `url` aliases `play`.

## Upstream

```
POST https://tikwm.com/api/feed/list
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Accept: application/json, text/javascript, */*; q=0.01
X-Requested-With: XMLHttpRequest
Referer: https://tikwm.com/
```

Body: `region`, `count`, `cursor`, `web=1`, `hd=1`. Timeout 15s (`AbortController`).
OK when JSON `code === 0`; `data` is the video array.

Helpers exported from `tiktok.js` for tests: `toAbsoluteUrl`, `normalizeQuery`,
`mapVideo`, `getTikWMFeed`. Tests: `node --test test/tiktok.test.js`.

## Extend

Keep native `fetch`. Don't add axios. Don't cache unless TikWM rate-limits.
