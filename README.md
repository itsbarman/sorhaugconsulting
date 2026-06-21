# Sørhaug Consulting

Nettside: https://sorhaugconsulting.no/

## Lokal utvikling med innlogging + dashboard

Prosjektet har nå en backend i `backend/` som gir:

- innlogging med sessions (HttpOnly-cookie)
- rate limiting på innlogging
- CSRF-beskyttelse på skrivekall
- dashboard med prosjektliste og adminverktøy
- tidsbegrensede, signerte lenker til beskyttede filer
- databasebasert lagring av brukere, prosjekter, medlemskap og filer

### 1) Installer backend-avhengigheter

```bash
cd backend
npm install
```

### 2) Sett opp miljøvariabler

```bash
cp .env.example .env
```

Rediger `backend/.env`:

- sett `ADMIN_NAME` (visningsnavn for første admin, valgfri)
- sett `SESSION_SECRET` (minst 32 tegn)
- sett `ASSET_SIGNING_SECRET` (minst 32 tegn)
- sett `ADMIN_EMAIL`
- generer hash:

```bash
npm run hash:password -- "DittSterkePassord123!"
```

og lim resultatet inn i `ADMIN_PASSWORD_HASH`.

### 3) Start server

```bash
npm run dev
```

Serveren kjører da på `http://localhost:3000`.

### 4) Test flyten

- åpne `http://localhost:3000/innlogging.html`
- logg inn med `ADMIN_EMAIL` og passordet du hash-et
- åpne dashboard og test nedlasting av ressurs

### 5) Bruk adminverktøy i dashboard

Som admin kan du nå:

- opprette brukere (kunde/admin)
- opprette prosjekter
- tildele medlemmer til prosjekt
- laste opp rapporter/bilder på prosjekt

### 6) Kjør automatisk e2e-sjekk (valgfritt)

Når serveren kjører lokalt, kan du validere hele flyten med:

```bash
node src/scripts/e2e-check.js
```

Skriptet tester innlogging, CSRF, brukeropprettelse, prosjektopprettelse og filopplasting.

## Hvor data ligger

- App-database: `backend/app.sqlite`
- Beskyttede filer (rapporter/bilder): `backend/protected/`
- Sessions: `backend/sessions.sqlite`

Merk: `backend/src/data/projects.json` brukes kun som engangs bootstrap hvis databasen er tom.
