'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, Ban, Unlock, Shield, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Badge, LoadingSpinner } from '@/components/ui/index'
import { formatDate, cn } from '@/lib/utils/index'
import toast from 'react-hot-toast'

const ROLE_COLORS: Record<string,string> = {
  user: 'bg-gray-100 text-gray-500 dark:bg-gray-800',
  agent: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  photographer: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  admin: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  super_admin: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
}

export function UtilisateursPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string|null>(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [notifText, setNotifText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select(`
        id, full_name, phone, avatar_url, referral_code, referred_by,
        free_visits_balance, is_blacklisted, language, created_at, updated_at,
        city:cities!profiles_city_id_fkey(name)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    // Récupérer les rôles séparément
    if (data && data.length > 0) {
      const ids = data.map((u: any) => u.id)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', ids)

      const roleMap: Record<string, string[]> = {}
      roles?.forEach((r: any) => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = []
        roleMap[r.user_id].push(r.role)
      })

      setUsers((data ?? []).map((u: any) => ({ ...u, roles: roleMap[u.id] ?? ['user'] })))
    } else {
      setUsers([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleBlacklist(userId: string, current: boolean) {
    setProcessing(userId)
    await supabase.from('profiles').update({ is_blacklisted: !current }).eq('id', userId)
    if (!current) {
      await supabase.from('notifications').insert({
        user_id: userId, title: '⚠️ Compte suspendu',
        body: 'Votre compte Habynex a été suspendu. Contactez le support.', channel: 'in_app'
      })
    }
    toast(current ? 'Utilisateur réactivé ✅' : 'Utilisateur bloqué ⚠️', { icon: current ? '✅' : '⚠️' })
    await load(); setProcessing(null)
  }

  async function sendNotif(userId: string) {
    if (!notifText.trim()) { toast.error('Entrez un message'); return }
    setProcessing(userId)
    await supabase.from('notifications').insert({
      user_id: userId, title: '📢 Message de l\'équipe Habynex',
      body: notifText.trim(), channel: 'in_app'
    })
    toast.success('Notification envoyée ✅')
    setNotifText(''); setProcessing(null)
  }

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search) ||
    u.referral_code?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Utilisateurs" subtitle={`${users.length} utilisateurs inscrits`} />

      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Rechercher par nom, téléphone, code parrainage…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors" />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
              <p className="text-4xl mb-3">👥</p><p className="text-gray-500">Aucun utilisateur trouvé</p>
            </div>
          ) : filtered.map(u => {
            const city = Array.isArray(u.city) ? u.city[0] : u.city
            const isExp = expandedId === u.id
            return (
              <div key={u.id} className={cn('bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden transition-colors', u.is_blacklisted ? 'border-red-200 dark:border-red-900' : 'border-gray-100 dark:border-gray-800')}>
                <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500 flex-shrink-0">
                      {u.full_name?.charAt(0) ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                          {u.full_name ?? 'Sans nom'}
                        </p>
                        {u.is_blacklisted && <Badge label="Bloqué" color="bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400" />}
                        {u.roles?.map((r: string) => (
                          <Badge key={r} label={r} color={ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-500'} />
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                        {u.phone && <span>{u.phone}</span>}
                        {city && <span>📍 {city.name}</span>}
                        <span>Inscrit {formatDate(u.created_at)}</span>
                        {u.free_visits_balance > 0 && <span className="text-green-500">🎁 {u.free_visits_balance} visite{u.free_visits_balance > 1 ? 's' : ''} gratuite{u.free_visits_balance > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggleBlacklist(u.id, u.is_blacklisted)} disabled={processing === u.id}
                      className={cn('w-8 h-8 flex items-center justify-center rounded-xl transition-colors', u.is_blacklisted ? 'bg-green-100 dark:bg-green-950/30 text-green-600 hover:bg-green-200' : 'bg-red-50 dark:bg-red-950/20 text-red-400 hover:bg-red-100')}>
                      {u.is_blacklisted ? <Unlock size={14}/> : <Ban size={14}/>}
                    </button>
                    <button onClick={() => setExpandedId(isExp ? null : u.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {isExp ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </button>
                  </div>
                </div>

                {isExp && (
                  <div className="px-5 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {u.referral_code && (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                          <p className="text-gray-400 mb-0.5">Code parrainage</p>
                          <p className="font-mono font-semibold text-gray-700 dark:text-gray-300">{u.referral_code}</p>
                        </div>
                      )}
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                        <p className="text-gray-400 mb-0.5">Langue</p>
                        <p className="font-semibold text-gray-700 dark:text-gray-300">{u.language ?? 'fr'}</p>
                      </div>
                    </div>

                    {/* Envoyer une notification */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Envoyer une notification</p>
                      <div className="flex gap-2">
                        <input value={notifText} onChange={e => setNotifText(e.target.value)}
                          placeholder="Message à envoyer à cet utilisateur…"
                          className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 outline-none focus:border-[#f95d1e]" />
                        <button onClick={() => sendNotif(u.id)} disabled={processing === u.id}
                          className="px-3 py-2 bg-[#f95d1e] text-white rounded-xl text-xs font-semibold hover:bg-[#e04f15] disabled:opacity-50 flex items-center gap-1">
                          <Send size={12}/> Envoyer
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
