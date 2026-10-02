# Security

Mythic is a personal app that holds your own tasks, notes and connector keys
in one SQLite file. How it protects them:

- **Local by default.** Without `MYTHIC_PASSWORD`, Mythic listens on
  127.0.0.1 and answers only requests addressed to `localhost`, which also
  blocks DNS-rebinding attacks from web pages you visit.
- **Password when exposed.** With `MYTHIC_PASSWORD` set, every page and route
  needs a signed, HTTP-only session cookie (30 days). Put Mythic behind HTTPS
  (a reverse proxy such as Caddy, or a tunnel) before you expose it.
- **Same-origin writes.** Every route that changes data takes JSON only and
  refuses requests whose `Origin` is another site.
- **API token.** The `/api/v1` token is shown once and stored only as a
  SHA-256 hash. Making a new one revokes the old one.
- **Connector keys** (the Telegram bot token, calendar addresses) stay in
  your database and are never shown back in full or included in exports.

Please report a vulnerability privately through GitHub's "Report a
vulnerability" (Security tab) rather than in a public issue.
