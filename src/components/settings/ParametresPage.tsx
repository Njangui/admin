'use client'
import { useState, useEffect } from 'react'
import { Save, Loader2, RefreshCw, Bell, Shield, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/index'
import { cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'
import type { AppSettings } from '@/types/index'

const DEFAULTS: AppSettings = {
  visit_price_1: 3000, visit_price_2: 5000, visit_price_3: 7000,
  referral_visits_threshold: 5,
  ai_model: 'deepseek-chat', ai_escalation_enabled: true,
  maintenance_mode: false, maintenance_message: '',
  whatsapp_contact: '237654888084', contact_email: 'contact.habynex@gmail.com',
  launch_cities: ['Yaoundé'],
  features: { blog: true, pwa: true, push_notifications: true, qr_share: true, persuasion_layer: true },
  campay_enabled: true,
  push_notifications_enabled: true
}

export function ParametresPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushStats, setPushStats] = useState<{ subscriptions: number; logs: number } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: settingsData }, { count: subCount }, { count: logCount }] = await Promise.all([
      supabase.from('app_settings').select('key, value'),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
      supabase.from('push_logs').select('id', { count: 'exact', head: true }),
    ])
    if (settingsData && settingsData.length > 0) {
      const obj: Record<string, any> = {}
      settingsData.forEach((row: any) => { try { obj[row.key] = JSON.parse(row.value) } catch { obj[row.key] = row.value } })
      setSettings({ ...DEFAULTS, ...obj })
    }
    setPushStats({ subscriptions: subCount ?? 0, logs: logCount ?? 0 })
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      const rows = Object.entries(settings).map(([key, value]) => ({
        key, value: JSON.stringify(value), updated_at: new Date().toISOString()
      }))
      const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
      toast.success('Paramètres sauvegardés ✅')
    } catch { toast.error('Erreur lors de la sauvegarde') }
    finally { setSaving(false) }
  }

  function update(key: keyof AppSettings, value: any) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  function updateFeature(key: string, value: boolean) {
    setSettings(prev => ({ ...prev, features: { ...prev.features, [key]: value } }))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  )

  const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <Icon size={15} className="text-[#f95d1e]" />
        <h2 className="font-semibold text-gray-800 dark:text-white text-sm">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-[#f95d1e] transition-colors"
  const toggleCls = (on: boolean) => cn('relative w-10 h-5 rounded-full transition-colors', on ? 'bg-[#f95d1e]' : 'bg-gray-200 dark:bg-gray-700')

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Paramètres" subtitle="Configuration de la plateforme Habynex"
        action={
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            Sauvegarder
          </button>
        }
      />

      {/* Tarifs visites */}
      <Section title="Tarifs des visites (FCFA)" icon={Zap}>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '1 bien', key: 'visit_price_1' as const },
            { label: '2-3 biens', key: 'visit_price_2' as const },
            { label: '4+ biens', key: 'visit_price_3' as const },
          ].map(f => (
            <Field key={f.key} label={f.label}>
              <input type="number" value={settings[f.key] as number}
                onChange={e => update(f.key, Number(e.target.value))}
                className={inputCls} />
            </Field>
          ))}
        </div>
        <Field label="Visites gratuites (parrainage — seuil)">
          <input type="number" value={settings.referral_visits_threshold}
            onChange={e => update('referral_visits_threshold', Number(e.target.value))}
            className={inputCls} />
        </Field>
      </Section>

      {/* Contact & Campay */}
      <Section title="Contact & Paiement" icon={Shield}>
        <Field label="WhatsApp support">
          <input type="text" value={settings.whatsapp_contact}
            onChange={e => update('whatsapp_contact', e.target.value)}
            placeholder="237654888084" className={inputCls} />
        </Field>
        <Field label="Email contact">
          <input type="email" value={settings.contact_email}
            onChange={e => update('contact_email', e.target.value)}
            className={inputCls} />
        </Field>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Campay (MTN/Orange)</p>
            <p className="text-xs text-gray-400">Paiements mobile money activés</p>
          </div>
          <button type="button" onClick={() => update('campay_enabled', !settings.campay_enabled)}
            className={toggleCls(!!settings.campay_enabled)}>
            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.campay_enabled ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0')} />
          </button>
        </div>
      </Section>

      {/* IA */}
      <Section title="Intelligence artificielle" icon={Zap}>
        <Field label="Modèle Claude">
          <select value={settings.ai_model} onChange={e => update('ai_model', e.target.value)} className={inputCls}>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (rapide)</option>
            <option value="deepseek-chat">deepseek-chat (équilibré)</option>
            <option value="deepseek-reasoner">deepseek-reasoner (recommandé)</option>
          </select>
        </Field>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Escalade automatique vers admin</p>
            <p className="text-xs text-gray-400">L&apos;IA transfère les conversations complexes</p>
          </div>
          <button type="button" onClick={() => update('ai_escalation_enabled', !settings.ai_escalation_enabled)}
            className={toggleCls(settings.ai_escalation_enabled)}>
            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.ai_escalation_enabled ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0')} />
          </button>
        </div>
      </Section>

      {/* Push notifications */}
      <Section title="Notifications push" icon={Bell}>
        {pushStats && (
          <div className="grid grid-cols-2 gap-3 mb-2">
            {[
              { label: 'Abonnés push', value: pushStats.subscriptions },
              { label: 'Envois enregistrés', value: pushStats.logs },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-800 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Push notifications activées</p>
            <p className="text-xs text-gray-400">Requiert les clés VAPID configurées</p>
          </div>
          <button type="button" onClick={() => update('push_notifications_enabled', !settings.push_notifications_enabled)}
            className={toggleCls(!!settings.push_notifications_enabled)}>
            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.push_notifications_enabled ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0')} />
          </button>
        </div>
      </Section>

      {/* Fonctionnalités */}
      <Section title="Fonctionnalités" icon={Shield}>
        {[
          { key: 'blog', label: 'Blog SEO', desc: 'Articles et contenu éditorial' },
          { key: 'pwa', label: 'PWA (Application mobile)', desc: 'Installation sur l\'écran d\'accueil' },
          { key: 'push_notifications', label: 'Notifications push', desc: 'Alertes temps réel' },
          { key: 'qr_share', label: 'QR Code de partage', desc: 'Partage des annonces via QR' },
          { key: 'persuasion_layer', label: 'Couche de persuasion', desc: 'Popups et urgences (vues, favoris...)' },
        ].map(f => (
          <div key={f.key} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{f.label}</p>
              <p className="text-xs text-gray-400">{f.desc}</p>
            </div>
            <button type="button" onClick={() => updateFeature(f.key, !settings.features?.[f.key])}
              className={toggleCls(!!settings.features?.[f.key])}>
              <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.features?.[f.key] ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0')} />
            </button>
          </div>
        ))}
      </Section>

      {/* Maintenance */}
      <Section title="Mode maintenance" icon={Shield}>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Activer la maintenance</p>
            <p className="text-xs text-gray-400">Redirige tous les visiteurs vers une page d&apos;attente</p>
          </div>
          <button type="button" onClick={() => update('maintenance_mode', !settings.maintenance_mode)}
            className={toggleCls(settings.maintenance_mode)}>
            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.maintenance_mode ? 'translate-x-5 left-0.5' : 'translate-x-0.5 left-0')} />
          </button>
        </div>
        {settings.maintenance_mode && (
          <Field label="Message de maintenance">
            <textarea value={settings.maintenance_message}
              onChange={e => update('maintenance_message', e.target.value)}
              rows={2} placeholder="Habynex est en cours de maintenance..." className={cn(inputCls, 'resize-none')} />
          </Field>
        )}
      </Section>

      <button onClick={save} disabled={saving}
        className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold rounded-2xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
        {saving ? <><Loader2 size={15} className="animate-spin"/>Sauvegarde…</> : <><Save size={15}/>Sauvegarder tous les paramètres</>}
      </button>
    </div>
  )
}
