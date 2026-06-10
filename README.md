# 🏠 Habynex Admin — Dashboard Administrateur v2.1

> Interface d'administration complète pour la plateforme immobilière Habynex.
> **Synchronisé avec Habynex-final** — les deux projets partagent la même base Supabase.

## Stack technique
- **Next.js 14** (App Router, TypeScript)
- **Supabase** (PostgreSQL + Auth + Realtime) — mêmes clés que Habynex-final
- **Tailwind CSS v3** + **next-themes** (dark/light mode)
- **@anthropic-ai/sdk** — génération rapports IA
- **lucide-react** · **recharts** · **react-hot-toast**

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Copier les variables d'environnement (MÊMES clés Supabase que Habynex-final)
cp .env.local.example .env.local
# Remplir avec vos vraies valeurs

# 3. Lancer en dev (port 3001 pour ne pas confondre avec Habynex-final sur 3000)
npm run dev  # → http://localhost:3001
```

## Variables d'environnement requises

```env
# Mêmes clés que Habynex-final — même projet Supabase
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_anon_key
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key   # ⚠️ Jamais exposer côté client

# Claude AI
ANTHROPIC_API_KEY=sk-ant-xxxxx

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3001           # ou https://admin.habynex.com
NEXT_PUBLIC_MAIN_APP_URL=https://habynex.com        # URL Habynex-final

# Cron secret (générer avec: openssl rand -hex 32)
CRON_SECRET=votre_cron_secret_long_et_aléatoire
```

## Pages disponibles

| Page | URL | Description |
|------|-----|-------------|
| Login | `/login` | Auth admin (vérifie table `user_roles`) |
| Dashboard | `/dashboard` | KPIs + alertes urgentes + rapport IA |
| Annonces | `/annonces` | Publier / Rejeter / Archiver listings |
| Réservations | `/reservations` | Assigner agents, confirmer dates, résultats visites |
| Agents | `/agents` | Valider / Rejeter / Suspendre + docs CNI |
| Photographes | `/photographes` | Gérer photographes terrain |
| Commissions | `/commissions` | Modèles A/B, suivi paiements owner/tenant/agent |
| Utilisateurs | `/utilisateurs` | Rôles, blacklist, notifications ciblées |
| Conversations | `/conversations` | Chat IA + prise en main admin + realtime |
| Rapports IA | `/rapports` | Rapports quotidiens + génération manuelle |
| Paramètres | `/parametres` | Tarifs visites, Campay, IA, push, features |

## API Routes admin

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/cron/daily-report` | POST | Génère le rapport IA quotidien (header `x-cron-secret`) |
| `/api/push/broadcast` | POST | Envoie une push notification (broadcast ou ciblée) |

## Tables Supabase utilisées

Toutes partagées avec Habynex-final :

- `profiles` — utilisateurs (champs: `criteria`, `language`, `free_visits_balance`, `is_blacklisted`)
- `listings` — annonces (statuts: `draft`, `pending_review`, `published`, `rented`, `archived`)
- `visit_bookings` — réservations (champs: `outcome`, `chosen_listing_id`, `reminder_24h_sent`, `admin_notes`)
- `agents` — agents (champs: `weekly_availability`, `success_rate`, `rating_avg`)
- `agent_ratings` — notes agents ⭐ (table ajoutée dans `habynex_new_features.sql`)
- `agent_contracts` — contrats signés (table ajoutée dans `habynex_new_features.sql`)
- `commissions` — commissions modèles A et B
- `conversations` / `messages` — messagerie IA
- `notifications` — notifications in-app
- `push_subscriptions` / `push_logs` — push notifications
- `photographers` — photographes terrain
- `daily_reports` — rapports IA quotidiens
- `app_settings` — configuration clé/valeur
- `user_roles` — rôles (`admin`, `super_admin`, `agent`, `photographer`, `user`)

## Configurer le cron rapport IA (22h chaque jour)

### Option 1 — Vercel Cron (recommandé)
Ajouter dans `vercel.json` :
```json
{
  "crons": [{
    "path": "/api/cron/daily-report",
    "schedule": "0 21 * * *"
  }]
}
```
Et ajouter `CRON_SECRET` dans les variables Vercel.

### Option 2 — Depuis Supabase pg_cron
```sql
SELECT cron.schedule(
  'habynex-daily-report',
  '0 21 * * *',
  $$ SELECT net.http_post(
    url := 'https://admin.habynex.com/api/cron/daily-report',
    headers := '{"x-cron-secret":"VOTRE_SECRET"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

## Déploiement Vercel

```bash
# Déployer sur admin.habynex.com
vercel --prod
```

Variables à ajouter sur Vercel : toutes celles du `.env.local`.

## Sécurité

- Le middleware vérifie que l'utilisateur a le rôle `admin` ou `super_admin` dans `user_roles`
- Le `SUPABASE_SERVICE_ROLE_KEY` n'est utilisé que côté serveur (API routes)
- Le `CRON_SECRET` protège l'endpoint de génération de rapport

## Contact
📧 contact.habynex@gmail.com · +237 654 888 084
