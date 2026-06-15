'use client'
import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const TYPES = [
  { value: 'apartment', label: '🏢 Appartement' },
  { value: 'studio',    label: '🛋️ Studio' },
  { value: 'room',      label: '🛏️ Chambre' },
  { value: 'villa',     label: '🏡 Villa' },
  { value: 'duplex',    label: '🏠 Duplex' },
  { value: 'commercial',label: '🏪 Local commercial' },
]

const TRANSACTIONS = [
  { value: 'rent',       label: '🔑 Location' },
  { value: 'sale',       label: '💰 Vente' },
  { value: 'furnished',  label: '🛋️ Meublé' },
  { value: 'coliving',   label: '👥 Colocation' },
  { value: 'short_stay', label: '📅 Court séjour' },
]

const AMENITIES = [
  { key: 'wifi',          label: '📶 Wi-Fi' },
  { key: 'parking',       label: '🚗 Parking' },
  { key: 'security',      label: '🔒 Gardiennage' },
  { key: 'water_24h',     label: '💧 Eau 24h/24' },
  { key: 'electricity',   label: '⚡ Électricité AES' },
  { key: 'generator',     label: '🔋 Groupe électrogène' },
  { key: 'air_conditioning', label: '❄️ Climatisation' },
  { key: 'garden',        label: '🌿 Jardin' },
  { key: 'terrace',       label: '🏞️ Terrasse/Véranda' },
]

const EMPTY_AMENITIES: Record<string, boolean> = {
  wifi: false, parking: false, security: false,
  water_24h: false, electricity: false, generator: false,
  air_conditioning: false, garden: false, terrace: false,
}

interface Props {
  listing: any
  onClose: () => void
  onSaved: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 outline-none focus:border-[#f95d1e] text-gray-700 dark:text-gray-200'

export function EditListingModal({ listing, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: listing.title ?? '',
    description: listing.description ?? '',
    type: listing.type ?? '',
    transaction: listing.transaction ?? '',
    price: listing.price ?? 0,
    price_negotiable: !!listing.price_negotiable,
    address_hint: listing.address_hint ?? '',
    bedrooms: listing.bedrooms ?? '',
    bathrooms: listing.bathrooms ?? '',
    surface_m2: listing.surface_m2 ?? '',
    furnished: !!listing.furnished,
    owner_name: listing.owner_name ?? '',
    owner_phone: listing.owner_phone ?? '',
    amenities: { ...EMPTY_AMENITIES, ...(listing.amenities ?? {}) },
  })

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Le titre est obligatoire'); return }
    if (!form.type) { toast.error('Sélectionnez un type de bien'); return }
    if (!form.transaction) { toast.error('Sélectionnez une transaction'); return }

    setSaving(true)
    try {
      const { error } = await supabase.from('listings').update({
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        transaction: form.transaction,
        price: Number(form.price) || 0,
        price_negotiable: form.price_negotiable,
        address_hint: form.address_hint.trim() || null,
        bedrooms: form.bedrooms !== '' ? Number(form.bedrooms) : null,
        bathrooms: form.bathrooms !== '' ? Number(form.bathrooms) : null,
        surface_m2: form.surface_m2 !== '' ? Number(form.surface_m2) : null,
        furnished: form.furnished,
        owner_name: form.owner_name.trim() || null,
        owner_phone: form.owner_phone.trim() || null,
        amenities: form.amenities,
        updated_at: new Date().toISOString(),
      }).eq('id', listing.id)

      if (error) {
        toast.error("Erreur lors de l'enregistrement")
        console.error(error)
        return
      }

      toast.success('Annonce mise à jour ✅')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 dark:text-white text-lg">Modifier l&apos;annonce</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>

        <Field label="Titre">
          <input className={inputCls} value={form.title} onChange={e => set('title', e.target.value)} />
        </Field>

        <Field label="Description">
          <textarea className={cn(inputCls, 'resize-none')} rows={4}
            value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type de bien">
            <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="">—</option>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Transaction">
            <select className={inputCls} value={form.transaction} onChange={e => set('transaction', e.target.value)}>
              <option value="">—</option>
              {TRANSACTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (FCFA)">
            <input type="number" min="0" className={inputCls} value={form.price}
              onChange={e => set('price', e.target.value === '' ? 0 : Number(e.target.value))} />
          </Field>
          <Field label="Prix négociable">
            <label className="flex items-center gap-2 h-[38px]">
              <input type="checkbox" className="rounded accent-[#f95d1e]" checked={form.price_negotiable}
                onChange={e => set('price_negotiable', e.target.checked)} />
              <span className="text-sm text-gray-600 dark:text-gray-300">Oui</span>
            </label>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Chambres">
            <input type="number" min="0" className={inputCls} value={form.bedrooms}
              onChange={e => set('bedrooms', e.target.value)} />
          </Field>
          <Field label="Salles de bain">
            <input type="number" min="0" className={inputCls} value={form.bathrooms}
              onChange={e => set('bathrooms', e.target.value)} />
          </Field>
          <Field label="Surface (m²)">
            <input type="number" min="0" className={inputCls} value={form.surface_m2}
              onChange={e => set('surface_m2', e.target.value)} />
          </Field>
        </div>

        <Field label="Repère / adresse">
          <input className={inputCls} value={form.address_hint} onChange={e => set('address_hint', e.target.value)} />
        </Field>

        <label className="flex items-center gap-2">
          <input type="checkbox" className="rounded accent-[#f95d1e]" checked={form.furnished}
            onChange={e => set('furnished', e.target.checked)} />
          <span className="text-sm text-gray-600 dark:text-gray-300">Meublé</span>
        </label>

        <Field label="Équipements">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AMENITIES.map(a => (
              <label key={a.key} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors',
                form.amenities[a.key] ? 'border-[#f95d1e] bg-orange-50 dark:bg-orange-950/20 text-[#f95d1e]' : 'border-gray-200 dark:border-gray-700 text-gray-500')}>
                <input type="checkbox" className="rounded accent-[#f95d1e]" checked={!!form.amenities[a.key]}
                  onChange={e => set('amenities', { ...form.amenities, [a.key]: e.target.checked })} />
                {a.label}
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom du propriétaire">
            <input className={inputCls} value={form.owner_name} onChange={e => set('owner_name', e.target.value)} />
          </Field>
          <Field label="Téléphone propriétaire">
            <input className={inputCls} value={form.owner_phone} onChange={e => set('owner_phone', e.target.value)} />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-500 font-semibold rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 bg-[#f95d1e] hover:bg-[#e04f15] text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
