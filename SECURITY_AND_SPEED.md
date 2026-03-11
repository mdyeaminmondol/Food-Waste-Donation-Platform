# Speed and Security Upgrades

## Speed Improvements Implemented

- CDN usage for Bootstrap, FontAwesome, and Leaflet in `index.html`.
- DNS prefetch + preconnect hints for CDN hosts in `index.html`.
- Deferred script loading (`defer`) for non-blocking page rendering.
- Response compression enabled in backend via `Flask-Compress`.
- HTTP cache headers configured in `app.py`:
  - API GET responses: short-term cache.
  - Static assets: 24h cache.
  - Minified assets (`*.min.*`): long-term immutable cache.
- Service Worker caching added in `sw.js` for app shell files.
- Debounced search filtering in `app.js` to reduce render pressure.

## Image Optimization and Lazy Loading

- Current UI is icon-based (FontAwesome), so it avoids heavy raster images by default.
- For future image assets:
  - Prefer WebP/AVIF formats.
  - Keep dimensions close to display size.
  - Add `loading="lazy"` for below-the-fold images.

## Database Query Optimizations

Implemented in `app.py` using SQLite:

- Parameterized SQL statements to prevent SQL injection.
- Indexes created on frequent filter columns:
  - `donations(status)`
  - `donations(food_type)`
  - `donations(quantity)`
  - `donations(lat, lng)`
  - `users(username)`
- Lightweight server-side donation query cache with TTL for GET requests.

## Security Improvements Implemented

- Password hashing with Werkzeug (`generate_password_hash` / `check_password_hash`).
- Session authentication with `Flask-Login`.
- JWT authentication token support for API clients.
- SQL injection protection with parameterized queries (`?` placeholders).
- Secure headers added in `app.py`:
  - `Content-Security-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - HSTS when using HTTPS
- Secure cookie flags enabled (HTTPOnly, SameSite, Secure).

## Run With HTTPS (recommended)

1. Install dependencies:

```powershell
pip install -r requirements.txt
```

2. Run with HTTPS in development:

```powershell
$env:ENABLE_HTTPS="1"
python app.py
```

3. Open:

- `https://127.0.0.1:5000`

## Optional Minified Asset Build

To generate minified local assets (requires Node.js):

```powershell
.\build-assets.ps1
```

Then switch HTML references to `styles.min.css` and `app.min.js` for production.
