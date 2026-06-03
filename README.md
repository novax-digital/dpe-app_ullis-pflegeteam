# Ullis Connect

Neuaufbau des Lovable-Prototyps als Next.js-App fuer Vercel und Supabase.

## Stack

- Next.js App Router, TypeScript, React 19
- Tailwind CSS 4
- Supabase Auth, Postgres, RLS, Realtime
- Vercel Route Handler fuer Admin-Aktionen

## Lokal starten

```bash
npm install
cp .env.example .env.local
npm run dev
```

Die Supabase-Werte kommen aus dem neuen Supabase-Projekt:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

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

5. Types bei Schema-Aenderungen aktualisieren:

```bash
supabase gen types typescript --project-id <project-ref> --schema public > src/lib/database.types.ts
```

## Aktueller Rebuild-Stand

- Login und geschuetztes App-Layout
- Rollen: `admin`, `employee`, `physiotherapy`
- Dashboard
- News mit Admin-CRUD und Publish-Status
- E-Bikes mit Admin-Verwaltung, Reservierung und Storno
- Gesundheitskurse mit Verwaltung, Anmeldung, Storno und Teilnahmestatus
- Mitarbeitendenanlage ueber `/api/admin/employees`
- Profileinstellungen

## Deploy auf Vercel

1. Repository mit Vercel verbinden.
2. Die drei Supabase-Env-Variablen in Vercel setzen.
3. Build Command: `npm run build`
4. Output/Framework: Next.js automatisch erkennen lassen.
