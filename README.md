# Ullis Connect

Neuaufbau des Lovable-Prototyps als Next.js-App für Vercel und Supabase.

## Stack

- Next.js App Router, TypeScript, React 19
- Tailwind CSS 4
- Supabase Auth, Postgres, RLS, Realtime
- Resend für spätere transaktionale E-Mails
- Vercel Route Handler für Admin-Aktionen

## Lokal starten

```bash
npm install
cp .env.example .env.local
npm run dev
```

Die Supabase- und Mail-Werte kommen aus Supabase, Resend und der späteren App-URL:

```bash
NEXT_PUBLIC_APP_URL=https://connect.ullis-pflegeteam.de
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL="Ullis Connect <noreply@example.com>"
CRON_SECRET=
```

`RESEND_FROM_EMAIL` muss später zu einer in Resend verifizierten Domain
passen.
`NEXT_PUBLIC_APP_URL` ist die Hauptdomain der App und wird für Einladungs-
und Passwort-Reset-Links in den Resend-E-Mails verwendet.
`CRON_SECRET` schützt automatisierte Cron-Endpunkte wie Kalender- und
Kurserinnerungen.

## Supabase einrichten

1. Neues Supabase-Projekt erstellen.
2. CLI lokal mit dem Projekt verbinden:

```bash
supabase link --project-ref <project-ref>
```

3. Migrationen ausspielen:

```bash
supabase db push
```

4. Ersten Admin bootstrappen: In Supabase Auth einen User anlegen und danach in SQL die Admin-Rolle setzen.

```sql
insert into public.user_roles (user_id, role)
values ('<auth-user-id>', 'admin')
on conflict (user_id, role) do nothing;
```

5. Types bei Schema-Änderungen aktualisieren:

```bash
supabase gen types typescript --project-id <project-ref> --schema public > src/lib/database.types.ts
```

## Aktueller Rebuild-Stand

- Login und geschütztes App-Layout
- Rollen: `admin`, `employee`, `physiotherapy`
- Pinnwand als persönlicher Überblick
- Nachrichten mit Erstellung für alle Nutzer, Kommentaren, Kategorien und Admin-Mailversand
- E-Bikes mit Admin-Verwaltung, mehrtägiger Reservierung und Storno
- Gesundheitskurse mit Verwaltung, Anmeldung, Storno, Teilnahmestatus und
  Erinnerungen an eingetragene Teilnehmende
- Mitarbeitendenanlage über `/api/admin/employees`

## Deploy auf Vercel

1. Repository mit Vercel verbinden.
2. Die Supabase-, App-URL- und Resend-Env-Variablen in Vercel setzen.
3. Build Command: `npm run build`
4. Output/Framework: Next.js automatisch erkennen lassen.
