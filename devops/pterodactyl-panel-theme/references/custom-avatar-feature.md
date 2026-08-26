# Custom User Avatar (profile picture upload) — Pterodactyl feature

## What was added (2026-08-26)
Users can upload a custom avatar (profile picture) shown in the navbar, activity
logs, and dashboard server rows. Falls back to Gravatar → BoringAvatar.

## Backend
- Migration `2026_08_26_013152_add_avatar_path_to_users_table.php`: adds
  `avatar_path` (string, nullable) to `users`.
- `app/Models/User.php`: `avatar_path` added to `$fillable` + `$validationRules`
  + `toVueObject()` (so `window.PterodactylUser.avatar_path` reaches the React app).
- `app/Http/Controllers/Api/Client/AvatarController.php`: 
  - `upload()` — POST, validates MIME (jpeg/png/gif/webp) + size (5MB), crops to
    256×256 center via **GD** (`imagecreatefrom*` + `imagecopyresampled`), saves
    to `storage/app/avatars/{user-uuid}.png`.
  - `delete()` — DELETE, removes file + nulls column.
  - `show($uuid)` — GET, serves PNG with cache headers (no auth — used in `<img src>`).
- Routes in `routes/api-client.php`:
  - `POST /api/client/account/avatar` (upload, auth)
  - `DELETE /api/client/account/avatar` (delete, auth)
  - `GET /api/client/account/avatar/{uuid}` — registered OUTSIDE the `/account`
    prefix so it needs no auth (images load in `<img src>` without cookies).
- Transformers (`UserTransformer`, `AccountTransformer`): `image` field now returns
  `/api/client/account/avatar/{uuid}` when `avatar_path` set, else Gravatar URL.

## Frontend
- `resources/scripts/components/Avatar.tsx`: `Avatar.User` renders `<img>` of
  `/api/client/account/avatar/{uuid}` when `avatarPath` set, else BoringAvatar.
  Uses RELATIVE URL (`/api/client/...`) — do NOT prepend a base_url.
- `resources/scripts/state/user.ts`: `UserData` interface + `avatarPath` field.
- `resources/scripts/components/App.tsx`: passes `PterodactylUser.avatar_path`
  into store.
- `resources/scripts/api/account/uploadAvatar.ts` / `deleteAvatar.ts`.
- `resources/scripts/components/dashboard/forms/AvatarUploadForm.tsx` + added to
  `AccountOverviewContainer.tsx` ("Profile Avatar" box).

## CRITICAL pitfall — multipart upload from axios
**NEVER set `Content-Type: multipart/form-data` manually on an axios FormData
POST.** Axios must generate the multipart `boundary` itself. Setting the header
manually (without boundary) makes Laravel fail to parse the multipart body →
upload "silently fails". The correct form:
```ts
const formData = new FormData();
formData.append('avatar', file);
const { data } = await http.post('/api/client/account/avatar', formData); // NO manual Content-Type
```
This was the bug that made user uploads fail after the feature shipped.

## Verification recipe
1. `php artisan migrate --force` (production guard).
2. Upload via curl with session + `X-XSRF-TOKEN` = urldecoded `XSRF-TOKEN` cookie.
3. Check file in `storage/app/avatars/`, DB `avatar_path`, and GET serve route → 200 image/png.
4. Rebuild: `sudo NODE_OPTIONS=--openssl-legacy-provider yarn build:production`
   then `chown -R www-data:www-data storage bootstrap/cache public/assets`.
