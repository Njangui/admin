'use client'
import React from 'react'
import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { toast.error('Email ou mot de passe incorrect'); return }
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).in('role', ['admin','super_admin'])
      if (!roles?.length) { toast.error('Accès non autorisé'); await supabase.auth.signOut(); return }
      router.push('/dashboard')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <Image src="/habynex-icon.png" alt="Habynex" width={40} height={40} className="w-10 h-10 object-contain" />
            <span className="text-2xl font-bold text-[#f95d1e]">habynex</span>
          </div>
          <p className="text-sm text-gray-500 font-medium">Administration</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8">
          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck size={18} className="text-[#f95d1e]" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-white">Connexion admin</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@habynex.com" autoComplete="email"
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-white bg-gray-50 dark:bg-gray-800 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Mot de passe</label>
              <div className="relative">
                <input type={showPwd?'text':'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-white bg-gray-50 dark:bg-gray-800 placeholder:text-gray-300 outline-none focus:border-gray-400 transition-colors" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || !email || !password}
              className="w-full py-3 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white dark:text-gray-900 font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mt-2">
              {loading ? <><Loader2 size={15} className="animate-spin"/>Connexion…</> : 'Se connecter'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Accès réservé aux administrateurs Habynex</p>
      </div>
    </div>
  )
}
