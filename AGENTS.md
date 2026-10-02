# Working on Mythic

Mythic is a personal dashboard: Next.js 16 (App Router), React 19, SQLite through better-sqlite3, plain JavaScript ES modules. Next 16 differs from older versions; read `node_modules/next/dist/docs/` before using an API from memory.

```bash
npm run dev     # http://localhost:3000
npm test        # node --test, tests sit beside each module as *.test.js
npm run lint
npm run build
```

- Pages are `app/*/page.js`, routes `app/api/*/route.js`. Domain logic lives in `lib/` and is tested there; components stay thin.
- Every widget is one registry entry in `lib/dash/widgets.js` (its server loader), one component in `components/dash/widgets/` and one stylesheet in `app/dash/widgets/`.
- JSON routes go through `jsonRoute` (`lib/http.js`); token routes under `app/api/v1` through `tokenRoute`. Sign-in rules live in `proxy.js` and `lib/auth.js`.
- Days are counted in the profile's timezone: use `localToday` and `wallTime` from `lib/day.js`, never the machine's clock.
- snake_case DB and JSON keys. Each module creates its own tables with an `ensure*` function.
- The UI never shows made-up data: an empty widget says it is empty and how to fill it.
- Copy is plain and direct, with short hyphens rather than long dashes.
