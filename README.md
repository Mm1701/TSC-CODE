# BOX QR Manager

Hybrid Bento + SaaS Dashboard + Dark/Light + Responsive + Light Glass UI.

## Stack
- HTML5 / CSS3 / Vanilla JavaScript
- Supabase Auth + Postgres + Realtime
- SheetJS for Excel import/export
- html5-qrcode for camera QR scanning

## Setup
1. Create a Supabase project.
2. Open `supabase/schema.sql` in Supabase SQL Editor and run it.
3. Create an email/password user in Supabase Authentication.
4. Open `js/config.js` and replace the placeholders with your Supabase URL and anon key.
5. Serve this folder from a web server (GitHub Pages, Netlify, Vercel, local static server, etc.).

## Export rules
- Single QR mode => Excel with exactly one column: `SN`
- Pair mode => Excel with exactly two columns: `oldBOX`, `newBOX`

## Main features in this starter
- Login/logout
- Dashboard statistics
- Single QR scanner
- OldBOX -> newBOX scanner
- Duplicate protection
- oldBOX != newBOX protection
- Scan history
- Pair management
- Excel import/export
- Dark/light mode
- Responsive mobile layout
- Supabase Realtime refresh
