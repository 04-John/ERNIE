# ERNIE frontend

React 19 + Vite + Recharts + TanStack Query.

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID
npm run dev            # http://localhost:5173
npm run build
```

## Design system

All colours, radii and type live in `src/index.css` as CSS variables (dark by default,
`[data-theme="light"]` overrides). Components use shared classes (`.card`, `.btn`, `.badge`,
`.table`, ...) and the primitives in `src/components/ui.jsx`.

## Adding the logo

- Replace `src/assets/brand/logo-mark.svg` (the square mark used in the sidebar, login and loading screen)
- Replace `public/favicon.svg` (browser tab icon)
- If the logo already includes the wordmark, pass `wordmark={false}` where `<Logo />` is used
- Brand colours: edit `--lime`, `--emerald`, `--brand-grad` and `--accent*` in `src/index.css`

Pages are lazy-loaded and routed with the URL hash (`#/analytics`), so refresh and the back button work.
