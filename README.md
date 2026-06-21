# Sørhaug Consulting

Nettside: https://sorhaugconsulting.no/

## Lokal utvikling med innlogging + dashboard

Prosjektet har nå en backend i `backend/` som gir:

- innlogging med sessions (HttpOnly-cookie)
- rate limiting på innlogging
- CSRF-beskyttelse på skrivekall
- dashboard med prosjektliste og adminverktøy
- tidsbegrensede, signerte lenker til beskyttede filer
- databasebasert lagring av brukere, prosjekter, medlemskap og filer i PostgreSQL

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

- sett `DATABASE_URL`, for eksempel `postgresql://sc_app:DITT_PASSORD@localhost:5432/sc_dev`
- sett `ADMIN_NAME` (visningsnavn for første admin, valgfri)
- sett `SESSION_SECRET` (minst 32 tegn)
- sett `ASSET_SIGNING_SECRET` (minst 32 tegn)
- sett `ADMIN_EMAIL`
- generer hash:

```bash
npm run hash:password -- "DittSterkePassord123!"
```

og lim resultatet inn i `ADMIN_PASSWORD_HASH`.

### 3) Opprett lokal PostgreSQL-database

Eksempel i pgAdmin / Query Tool:

```sql
CREATE USER sc_app WITH PASSWORD 'ByttTilEtSterktPassord';
CREATE DATABASE sc_dev OWNER sc_app;
GRANT ALL PRIVILEGES ON DATABASE sc_dev TO sc_app;
```

Backend oppretter tabellene automatisk ved oppstart.

### 4) Start server

```bash
npm run dev
```

Serveren kjører da på `http://localhost:3000`.

### 5) Test flyten

- åpne `http://localhost:3000/innlogging.html`
- registrer en ny bruker eller logg inn med `ADMIN_EMAIL`
- logg inn med `ADMIN_EMAIL` og passordet du hash-et
- åpne dashboard og test nedlasting av ressurs

### 6) Bruk adminverktøy i dashboard

Som admin kan du nå:

- opprette brukere (kunde/admin)
- opprette prosjekter
- tildele medlemmer til prosjekt
- laste opp rapporter/bilder på prosjekt

### 7) Kjør automatisk e2e-sjekk (valgfritt)

Når serveren kjører lokalt, kan du validere hele flyten med:

```bash
node src/scripts/e2e-check.js
```

Skriptet tester innlogging, CSRF, brukeropprettelse, prosjektopprettelse og filopplasting.

## Hvor data ligger

- App-database: PostgreSQL-databasen du peker `DATABASE_URL` til
- Beskyttede filer (rapporter/bilder): `backend/protected/`
- Sessions: PostgreSQL-tabellen `user_sessions`

Merk: `backend/src/data/projects.json` brukes kun som engangs bootstrap hvis databasen er tom.
