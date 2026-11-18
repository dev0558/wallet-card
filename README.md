# Wallet Card

An AI business card generator. Make a digital business card, keep it on your phone, and show a QR code that other people scan to save your contact. It installs to the home screen as a PWA and works offline.

There is no Apple Wallet or Google Wallet integration (no `.pkpass`, no Wallet APIs), so no developer accounts are needed.

- **Editor** with live preview, colour pickers and a WCAG contrast check
- **Three quick steps** (You, Contact, Style) with one-tap colour looks and a stopwatch
- **My Card**: full-screen card with a large QR code (Contact vCard, Website or LinkedIn)
- **Share**: save a 1080x1350 image (to Photos on iPhone), download a `.vcf`, or share your link
- **Private**: your card lives only on your device. The server stores nothing.

## Setup

Requires Node 18 or newer.

```bash
npm install
cp .env.example .env      # then add ANTHROPIC_API_KEY (optional)
npm start                 # http://127.0.0.1:3000
```

| Variable | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Optional. Without it the app works and the Claude button is disabled with a message. |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Any Claude model ID. |
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` to listen on your network. |

`GET /api/health` returns `{ "claude": true|false }`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart on file changes |
| `npm test` | Unit, QR round-trip and server tests |
| `npm run icons` | Regenerate `public/icons/*.png` from the SVG design in `scripts/make_icons.js` |
| `npm run vendor:qrcode` | Rebuild `public/vendor/qrcode.js` from the installed `qrcode` package |
| `npm run vendor:fonts` | Copy the self-hosted Fredoka and Nunito fonts (OFL) into `public/fonts` |

## Production (Vercel)

Live at **https://wallet-card-sandy.vercel.app**. To deploy:

```bash
vercel deploy --prod
```

- `vercel.json` sets the Express framework preset. `server.js` is the entrypoint: it exports the app, and calls `listen()` only when not on Vercel.
- Files in `public/` are served by Vercel's CDN, not Express, so `vercel.json` repeats the same security headers. A test fails if its CSP drifts from `lib/app.js`.
- On Vercel the server trusts one proxy hop, because Vercel's edge sets `X-Forwarded-For`, so rate limiting is per real visitor IP. The limiter keeps its counts in memory on each function instance, so it is a soft limit, not a global one.
- To enable "Polish with Claude" in production, add `ANTHROPIC_API_KEY` (and optionally `CLAUDE_MODEL`) under Project Settings, Environment Variables, then redeploy.

## Testing on a phone (HTTPS)

Service workers and "Install app" need HTTPS, except on `localhost`. A plain `http://192.168.x.x` URL on your phone will load the page, but it won't install or work offline. Use a tunnel:

**cloudflared** (no account needed for a quick tunnel):

```bash
brew install cloudflared
npm start
cloudflared tunnel --url http://localhost:3000
```

**ngrok**:

```bash
brew install ngrok
ngrok config add-authtoken <your token>
npm start
ngrok http 3000
```

Open the `https://...` URL it prints on your phone. The server trusts `X-Forwarded-For` only from loopback (the tunnel agent), so rate limiting still works per real client IP.

The tunnel URL is public while it runs, so stop it when you are done.

## Installing the app

**iPhone (Safari)**
1. Open the site in Safari.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open Wallet Card from the home screen. The app shows this hint once.

**Android (Chrome)**
1. Open the site in Chrome.
2. Tap **Install app** in the top bar, or use the menu, then **Install app** / **Add to Home screen**.

Once installed, the app opens straight to your card, and it works offline.

### Using it
- **Save image**: on a phone this opens the share sheet. On iPhone, tap **Save Image** to put the card in Photos, ready to show without opening the app. On desktop it downloads the PNG.
- **Add to contacts**: downloads a `.vcf` with your photo and bio. The QR code itself leaves out the photo and bio to stay small enough to scan easily.
- **QR mode**: Contact (vCard), Website or LinkedIn. If your contact details make a dense code (over about 400 bytes), the app suggests the Website or LinkedIn mode.
- The screen stays awake while your card is showing (where the browser supports the Wake Lock API).

## How it works

```
server.js            loads .env, creates the Anthropic client, starts the app
lib/app.js           Express app: security headers, CSP, rate limit, /api routes, static files
lib/claude.js        Claude request, tool definition, output validation
public/fields.js     field limits and normalisers (shared by browser and server)
public/colors.js     WCAG contrast maths and palette repair (shared)
public/vcard.js      vCard 3.0 builder (shared, unit tested)
public/qr.js         wrapper around the vendored qrcode library
public/app.js        the UI
public/sw.js         service worker
public/vendor/qrcode.js   the qrcode npm package, bundled for the browser
public/fonts/        Fredoka (display) and Nunito (body), self-hosted for the CSP and offline use
```

### Design
The look is playful and cartoon-like: ink outlines, offset "sticker" shadows and a mascot (a small business card with a face, drawn once as an SVG `<symbol>` in `index.html`). The editor is four quick steps with a stopwatch, because the point of the app is to get a card made fast. Motion includes step slides, confetti on save, a tilting preview and page transitions through the View Transitions API. Everything still works with `prefers-reduced-motion`, which turns the motion off. The QR code always stays black on white.

### Claude (server only)
The editor no longer offers "Polish with Claude" (removed from the UI on 2026-11-19). The endpoint below is still in the server and its tests, and returns 503 unless `ANTHROPIC_API_KEY` is set.

`POST /api/enhance` sends `{ card, vibe }`. The server cleans the card, then calls Claude with a strict `polish_card` tool whose schema allows only `title`, `tagline`, `bio` and `colors`. Contact details (email, phone, URLs) and the photo are never sent to Claude.

The system prompt tells Claude to improve wording only and never invent employers, credentials or contact details. It also says that content inside `<card>` and `<vibe>` tags is data, not instructions. User text is JSON-encoded with `<` and `>` escaped, so it cannot close those tags.

- **Tool choice:** `claude-sonnet-5-5` (and Opus 5.5 / Fable 5.1+) return a 400 for a forced `tool_choice`. On those models the request uses `tool_choice: auto` with `strict: true`, and the server rejects any reply without the tool call. On models that accept it, the request forces the tool.
- **Refusals:** a refused request returns 422. On Sonnet 5.5 the request also turns on server-side refusal fallback (`fallbacks: "default"`).
- **Output checks:** the server sanitises and length-caps Claude's text, validates the hex colours (falling back to the card's colours if invalid), and adjusts the palette to WCAG AA (4.5:1 for text, 3:1 for labels) before returning it.

### QR
The QR uses the `qrcode` npm package in byte mode with UTF-8 (so Assamese, Hindi and Arabic names work) and error correction level M. It is generated fully in the browser. Version 1.5 no longer ships a browser build, so `scripts/vendor_qrcode.js` bundles its own `lib/browser.js` into `public/vendor/qrcode.js` with esbuild. It is served from `'self'`, with no CDN and no `eval`.

## Security notes

- **Server**
  - The JSON body limit is 600 KB.
  - Every field is trimmed, length-capped (by code point) and stripped of control characters and Unicode bidi override characters.
  - Email and phone formats are validated. URLs must be http(s) with a dotted hostname and no credentials, and bare domains get `https://`.
  - `/api/*` is rate-limited to 20 requests per minute per IP.
- **Headers**
  - `x-powered-by` is removed.
  - `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` are set.
  - The CSP is strict: `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, with no inline scripts and no `unsafe-*`.
  - `X-Frame-Options: DENY`, `COOP` and a restrictive `Permissions-Policy` are also set.
- **Errors**
  - Errors never leak internals. SDK errors become friendly messages without details from the upstream service.
- **Frontend**
  - User text is only ever set with `textContent` or attribute setters, never `innerHTML`.
  - The only markup inserted is the QR SVG produced by the library, and it is parsed as SVG (`DOMParser`, `image/svg+xml`), not HTML.
- **Storage**
  - Card data is stored only in `localStorage` on the device, and every read and write is wrapped in `try/catch`.
  - The service worker is network-only for `/api/*` and never caches API responses.
- **API key**
  - The API key is read on the server only and is never sent to the browser.

When you change a file in `public/`, bump `VERSION` in `public/sw.js` so installed apps pick up the update.

## Tests

```bash
npm test
```

- `test/vcard.test.js`: escaping (backslash, comma, semicolon, newline), CRLF line endings, N/FN split, Unicode names, line folding, compact and full output.
- `test/qr.test.js`: loads the vendored browser build, encodes a short URL, a full vCard, Assamese, Hindi and Arabic vCards, a ~400-byte payload (version 10+) and a ~1.1 KB payload (version 20+). It rasterises both the SVG output (via resvg) and the module matrix used by the image export, decodes each with jsQR, and asserts the text and bytes match exactly.
- `test/server.test.js`: `/api/enhance` input validation, size limits, sanitising, prompt-injection tag escaping, request shape per model, colour and contrast clamping, refusal and SDK error handling, missing API key, rate limiting and security headers. The Anthropic client is mocked, so no network calls are made.
- `test/colors.test.js`: contrast maths, plus a 2,000-pair fuzz test that the palette repair always reaches AA.

## v2 ideas

- Apple Wallet / Google Wallet pass export once developer accounts exist
- NFC tap-to-share (Web NFC on Android, NFC tags/cards)
- Short-link QR with scan analytics (smaller, easier-to-scan codes, and you can update the details behind the link)
- Multiple saved cards (work, personal, event) with a switcher
- Optional encrypted sync between your own devices
- vCard 4.0 output and more social profiles
