/**
 * HABYNEX — admin-notification Edge Function
 *
 * Gère toutes les notifications utilisateurs et admins :
 *   • document_verification  → notifie les admins quand un user soumet un document
 *   • account_action         → notifie un user (document approuvé/rejeté, KYC, etc.)
 *   • welcome                → message de bienvenue après la 1ère subscription push
 *   • owner_report           → rapport envoyé au propriétaire d'une annonce
 *
 * 100 % Supabase — aucune dépendance externe (plus de Render).
 * Appel via : POST /functions/v1/admin-notification
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// URL interne Supabase de la fonction push-notifications (chiffrement VAPID)
const PUSH_NOTIFICATIONS_URL =
  Deno.env.get("PUSH_NOTIFICATIONS_URL") ||
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/push-notifications`;

const MAX_RETRIES = 5;
const BASE_DELAY = 2000; // ms
const CONCURRENCY_LIMIT = 5;
const REQUEST_TIMEOUT = 15_000; // 15 s

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, any>;
  actions?: Array<{ action: string; title: string }>;
}

interface NotificationJob {
  id: string;
  userId: string;
  type: "document_verification" | "welcome" | "owner_report" | "account_action";
  payload: NotificationPayload;
  attempts: number;
  createdAt: number;
}

interface AdminInfo {
  user_id: string;
  full_name: string | null;
  language: string | null;
  notification_preferences: {
    push_document_verification?: boolean;
    push_admin_alerts?: boolean;
    push_account?: boolean;
    push_marketing?: boolean;
    quiet_hours_enabled?: boolean;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
  } | null;
}

// ─────────────────────────────────────────────
// SCHEMAS DE VALIDATION
// ─────────────────────────────────────────────

const documentVerificationSchema = z.object({
  type: z.literal("document_verification"),
  userId: z.string().uuid(),
  documentType: z.enum(["passport", "id_card", "driver_license", "proof_of_address", "other"]),
  submissionId: z.string().uuid(),
  metadata: z.record(z.any()).optional(),
});

const accountActionSchema = z.object({
  type: z.literal("account_action"),
  userId: z.string().uuid(),
  actionType: z.enum(["document_approved", "document_rejected", "account_verified", "kyc_completed"]),
  payload: z.object({
    title: z.string(),
    body: z.string(),
    icon: z.string().optional(),
    badge: z.string().optional(),
    tag: z.string().optional(),
    requireInteraction: z.boolean().optional(),
    data: z.record(z.any()).optional(),
    actions: z.array(z.object({ action: z.string(), title: z.string() })).optional(),
  }),
});

const welcomeSchema = z.object({
  type: z.literal("welcome"),
  userId: z.string().uuid(),
  language: z.enum(["fr", "en"]).optional(),
});

const ownerReportSchema = z.object({
  type: z.literal("owner_report"),
  userId: z.string().uuid(),
  reportType: z.string(),
  propertyId: z.string().uuid().optional(),
  payload: z.object({
    title: z.string(),
    body: z.string(),
    data: z.record(z.any()).optional(),
  }),
});

// ─────────────────────────────────────────────
// SUPABASE CLIENT (singleton)
// ─────────────────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _supabase;
}

// ─────────────────────────────────────────────
// ENVOI PUSH VIA SUPABASE (sans Render)
// ─────────────────────────────────────────────

async function sendPush(userId: string, payload: NotificationPayload): Promise<boolean> {
  const supabase = getSupabase();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Vérifier que l'utilisateur a des subscriptions actives
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId)
    .limit(1);

  if (!subs?.length) {
    console.log(`[admin-notification] No push subscriptions for user ${userId}`);
    return false;
  }

  // 2. Appeler push-notifications (chiffrement VAPID natif Supabase)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(PUSH_NOTIFICATIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ userId, payload }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`push-notifications error ${res.status}: ${err}`);
    }

    const result = await res.json();

    // 3. Logger dans l'historique
    await supabase.from("notification_history").insert({
      user_id: userId,
      type: payload.data?.type ?? "push",
      title: payload.title,
      content: payload.body,
      metadata: { ...payload.data, channels: ["push"], result },
      created_at: new Date().toISOString(),
    }).catch(() => {}); // Silencieux si la table n'existe pas encore

    return result.success === true;
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─────────────────────────────────────────────
// FILE D'ATTENTE AVEC CONCURRENCE CONTRÔLÉE
// ─────────────────────────────────────────────

class NotificationQueue {
  private queue: NotificationJob[] = [];
  private processing = false;
  private active = 0;

  add(job: Omit<NotificationJob, "id" | "attempts" | "createdAt">): string {
    const full: NotificationJob = {
      ...job,
      id: crypto.randomUUID(),
      attempts: 0,
      createdAt: Date.now(),
    };
    this.queue.push(full);
    this.process();
    return full.id;
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 || this.active > 0) {
      while (this.active < CONCURRENCY_LIMIT && this.queue.length > 0) {
        const job = this.queue.shift()!;
        this.active++;
        this.run(job).finally(() => this.active--);
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    this.processing = false;
  }

  private async run(job: NotificationJob) {
    try {
      await sendPush(job.userId, job.payload);
      console.log(`[admin-notification] Job ${job.id} (${job.type}) envoyé`);
    } catch (err: any) {
      job.attempts++;

      if (job.attempts < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, job.attempts);
        console.warn(`[admin-notification] Job ${job.id} échoué, retry ${job.attempts}/${MAX_RETRIES} dans ${delay}ms`);
        setTimeout(() => { this.queue.push(job); this.process(); }, delay);
      } else {
        console.error(`[admin-notification] Job ${job.id} abandonné après ${MAX_RETRIES} tentatives`);
        await getSupabase()
          .from("failed_push_jobs")
          .insert({
            job_id: job.id,
            user_id: job.userId,
            type: job.type,
            payload: job.payload,
            error: err.message,
            attempts: job.attempts,
            created_at: new Date().toISOString(),
          })
          .catch(() => {});
      }
    }
  }
}

const queue = new NotificationQueue();

// ─────────────────────────────────────────────
// HANDLERS PAR TYPE
// ─────────────────────────────────────────────

// 1. DOCUMENT VERIFICATION → alerte tous les admins actifs
async function handleDocumentVerification(
  data: z.infer<typeof documentVerificationSchema>
) {
  const supabase = getSupabase();
  const { userId, documentType, submissionId, metadata } = data;

  console.log(`[document-verification] Traitement soumission ${submissionId}`);

  // Récupérer le soumetteur
  const { data: submitter, error: sErr } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", userId)
    .single();

  if (sErr || !submitter) throw new Error(`Soumetteur introuvable : ${sErr?.message}`);

  // Récupérer les IDs admin
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "super_admin"]);

  const adminIds = adminRoles?.map((r) => r.user_id) ?? [];
  if (!adminIds.length) return { success: true, message: "Aucun admin trouvé", queued: 0 };

  // Récupérer les profils admin avec préférences
  const { data: admins, error: aErr } = await supabase
    .from("profiles")
    .select(`
      user_id, full_name, language,
      notification_preferences (
        push_document_verification,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end
      )
    `)
    .eq("is_active", true)
    .in("user_id", adminIds);

  if (aErr) throw new Error(`Erreur récupération admins : ${aErr.message}`);
  if (!admins?.length) return { success: true, message: "Aucun admin actif", queued: 0 };

  let queued = 0;
  let skipped = 0;

  for (const admin of admins as AdminInfo[]) {
    const prefs = admin.notification_preferences;

    if (prefs?.push_document_verification === false) { skipped++; continue; }
    if (isQuietHours(prefs)) { skipped++; continue; }

    const isFr = admin.language !== "en";

    queue.add({
      userId: admin.user_id,
      type: "document_verification",
      payload: {
        title: isFr ? "📄 Nouveau document à vérifier" : "📄 New document to verify",
        body: isFr
          ? `${submitter.full_name} a soumis un ${formatDocType(documentType, "fr")}`
          : `${submitter.full_name} submitted a ${formatDocType(documentType, "en")}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-72.png",
        tag: `doc-verif-${submissionId}-${admin.user_id}`,
        requireInteraction: true,
        data: {
          type: "document_verification",
          submissionId,
          documentType,
          submitterName: submitter.full_name,
          submitterEmail: submitter.email,
          url: `/admin/documents/${submissionId}`,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
        actions: [
          { action: "view", title: isFr ? "👁️ Vérifier" : "👁️ Review" },
          { action: "dismiss", title: isFr ? "✓ Lu" : "✓ Read" },
        ],
      },
    });

    queued++;
  }

  return { success: true, submissionId, totalAdmins: admins.length, queued, skipped };
}

// 2. ACCOUNT ACTION → notifie le user concerné
async function handleAccountAction(data: z.infer<typeof accountActionSchema>) {
  const { userId, actionType, payload } = data;

  console.log(`[account-action] ${actionType} pour user ${userId}`);

  const { data: subs } = await getSupabase()
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (!subs?.length) return { success: false, message: "Aucune subscription active", queued: 0 };

  const jobId = queue.add({
    userId,
    type: "account_action",
    payload: {
      ...payload,
      data: {
        ...payload.data,
        actionType,
        userId,
        timestamp: new Date().toISOString(),
      },
    },
  });

  return { success: true, jobId, actionType, userId, queued: 1 };
}

// 3. WELCOME → bienvenue après 1ère subscription push
async function handleWelcome(data: z.infer<typeof welcomeSchema>) {
  const { userId, language } = data;

  console.log(`[welcome] Envoi bienvenue à ${userId}`);

  let lang = language;
  if (!lang) {
    const { data: profile } = await getSupabase()
      .from("profiles")
      .select("language")
      .eq("user_id", userId)
      .single();
    lang = profile?.language ?? "fr";
  }

  const isFr = lang === "fr";

  const jobId = queue.add({
    userId,
    type: "welcome",
    payload: {
      title: isFr ? "👋 Bienvenue sur Habynex !" : "👋 Welcome to Habynex!",
      body: isFr
        ? "Vous recevrez maintenant les alertes importantes sur vos biens et vos réservations."
        : "You will now receive important alerts about your properties and bookings.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-72.png",
      tag: "welcome-notification",
      requireInteraction: false,
      data: { type: "welcome", url: "/", timestamp: new Date().toISOString() },
      actions: [
        { action: "explore", title: isFr ? "🏠 Voir les annonces" : "🏠 Browse listings" },
        { action: "dismiss", title: "✓ OK" },
      ],
    },
  });

  return { success: true, jobId, userId, language: lang, queued: 1 };
}

// 4. OWNER REPORT → rapport envoyé au propriétaire d'une annonce
async function handleOwnerReport(data: z.infer<typeof ownerReportSchema>) {
  const { userId, reportType, propertyId, payload } = data;

  console.log(`[owner-report] Envoi rapport "${reportType}" à ${userId}`);

  const jobId = queue.add({
    userId,
    type: "owner_report",
    payload: {
      ...payload,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-72.png",
      tag: `owner-report-${reportType}-${propertyId ?? "general"}`,
      data: {
        ...payload.data,
        type: "owner_report",
        reportType,
        propertyId,
        url: propertyId ? `/annonces/${propertyId}` : "/profil",
        timestamp: new Date().toISOString(),
      },
    },
  });

  return { success: true, jobId, userId, reportType, queued: 1 };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function isQuietHours(prefs: AdminInfo["notification_preferences"]): boolean {
  if (!prefs?.quiet_hours_enabled || !prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;
  const now = new Date();
  const cur = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const { quiet_hours_start: s, quiet_hours_end: e } = prefs;
  return s < e ? cur >= s && cur <= e : cur >= s || cur <= e;
}

function formatDocType(type: string, lang: "fr" | "en"): string {
  const map = {
    fr: { passport: "passeport", id_card: "carte d'identité", driver_license: "permis de conduire", proof_of_address: "justificatif de domicile", other: "document" },
    en: { passport: "passport", id_card: "ID card", driver_license: "driver's license", proof_of_address: "proof of address", other: "document" },
  };
  return map[lang][type as keyof typeof map["fr"]] ?? type;
}

// ─────────────────────────────────────────────
// SERVEUR HTTP
// ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    switch (body.type) {
      case "document_verification": {
        const data = documentVerificationSchema.parse(body);
        return json(await handleDocumentVerification(data));
      }
      case "account_action": {
        const data = accountActionSchema.parse(body);
        return json(await handleAccountAction(data));
      }
      case "welcome": {
        const data = welcomeSchema.parse(body);
        return json(await handleWelcome(data));
      }
      case "owner_report": {
        const data = ownerReportSchema.parse(body);
        return json(await handleOwnerReport(data));
      }
      default:
        return json({ success: false, error: `Type inconnu : "${body.type}"` }, 400);
    }
  } catch (err: any) {
    console.error("[admin-notification] Erreur :", err);
    const status = err.name === "ZodError" ? 400 : 500;
    return json({ success: false, error: err.message, type: err.name }, status);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
