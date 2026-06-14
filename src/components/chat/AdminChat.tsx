'use client'

/**
 * AdminChat.tsx — Groupe de messagerie interne Habynex
 * Discussion en temps réel entre admins
 * Super admin : pouvoirs complets (supprimer messages, exclure membres, gérer)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import {
  Send, Loader2, Trash2, Pin, PinOff, Shield, User,
  MoreVertical, X, Crown, MessageSquare, Users, AlertCircle,
  ChevronDown, Smile,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/index'
import { formatDate } from '@/lib/utils/index'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface AdminMessage {
  id: string
  content: string
  sender_id: string
  sender_name: string
  sender_role: string
  sender_avatar?: string | null
  is_pinned: boolean
  pinned_by?: string | null
  deleted_at?: string | null
  created_at: string
  reactions?: Record<string, string[]>  // emoji → [user_ids]
}

interface AdminMember {
  id: string
  full_name: string
  role: string
  avatar_url?: string | null
  last_seen?: string | null
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '✅']

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'À l\'instant'
  if (mins < 60) return `Il y a ${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Il y a ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `Il y a ${days}j`
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'super_admin') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-[9px] font-bold rounded-full">
      <Crown size={8} /> Super Admin
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-[9px] font-bold rounded-full">
      <Shield size={8} /> Admin
    </span>
  )
}

// ─────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────

export function AdminChat() {
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [currentUser, setCurrentUser] = useState<AdminMember | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [members, setMembers] = useState<AdminMember[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showMembers, setShowMembers] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<AdminMessage[]>([])
  const [showPinned, setShowPinned] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null)
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const [unreadCount, setUnreadCount] = useState(0)
  const lastReadRef = useRef<string | null>(null)

  // ── Init ────────────────────────────────────────────────────────
  useEffect(() => {
    initUser()
  }, [])

  async function initUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: profile }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').eq('id', user.id).single(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'super_admin']).single(),
    ])

    const role = roleData?.role ?? 'admin'
    const me: AdminMember = {
      id: user.id,
      full_name: profile?.full_name ?? 'Admin',
      role,
      avatar_url: profile?.avatar_url,
    }
    setCurrentUser(me)
    setIsSuperAdmin(role === 'super_admin')

    // Mettre à jour last_seen
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id)

    await loadMembers()
    await loadMessages()
    setLoading(false)
  }

  async function loadMembers() {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['admin', 'super_admin'])

    if (!data?.length) return

    const ids = data.map(r => r.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, last_seen')
      .in('id', ids)

    const membersList: AdminMember[] = (profiles ?? []).map(p => ({
      id: p.id,
      full_name: p.full_name ?? 'Admin',
      role: data.find(r => r.user_id === p.id)?.role ?? 'admin',
      avatar_url: p.avatar_url,
      last_seen: p.last_seen,
    })).sort((a, b) => {
      if (a.role === 'super_admin' && b.role !== 'super_admin') return -1
      if (b.role === 'super_admin' && a.role !== 'super_admin') return 1
      return a.full_name.localeCompare(b.full_name)
    })

    setMembers(membersList)

    // Considérer "en ligne" si last_seen < 5 min
    const online = new Set<string>()
    membersList.forEach(m => {
      if (m.last_seen && Date.now() - new Date(m.last_seen).getTime() < 5 * 60 * 1000) {
        online.add(m.id)
      }
    })
    setOnlineIds(online)
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('admin_messages')
      .select(`
        id, content, sender_id, is_pinned, pinned_by,
        deleted_at, created_at, reactions,
        sender:profiles!admin_messages_sender_id_fkey(full_name, avatar_url),
        sender_role:user_roles!admin_messages_sender_id_fkey(role)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(80)

    const msgs: AdminMessage[] = (data ?? []).map((m: any) => {
      const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender
      const roleRow = Array.isArray(m.sender_role) ? m.sender_role[0] : m.sender_role
      return {
        id: m.id,
        content: m.content,
        sender_id: m.sender_id,
        sender_name: sender?.full_name ?? 'Admin',
        sender_role: roleRow?.role ?? 'admin',
        sender_avatar: sender?.avatar_url,
        is_pinned: m.is_pinned ?? false,
        pinned_by: m.pinned_by,
        deleted_at: m.deleted_at,
        created_at: m.created_at,
        reactions: m.reactions ?? {},
      }
    })

    setMessages(msgs)
    setPinnedMessages(msgs.filter(m => m.is_pinned))

    // Marquer comme lu
    if (msgs.length > 0) {
      lastReadRef.current = msgs[msgs.length - 1].created_at
    }
  }

  // ── Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-chat-room')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'admin_messages',
      }, async payload => {
        // Enrichir le message avec les données du sender
        const { data: sender } = await supabase
          .from('profiles').select('full_name, avatar_url').eq('id', payload.new.sender_id).single()
        const { data: roleRow } = await supabase
          .from('user_roles').select('role').eq('user_id', payload.new.sender_id)
          .in('role', ['admin', 'super_admin']).single()

        const newMsg: AdminMessage = {
          id: payload.new.id,
          content: payload.new.content,
          sender_id: payload.new.sender_id,
          sender_name: sender?.full_name ?? 'Admin',
          sender_role: roleRow?.role ?? 'admin',
          sender_avatar: sender?.avatar_url,
          is_pinned: payload.new.is_pinned ?? false,
          pinned_by: payload.new.pinned_by,
          deleted_at: payload.new.deleted_at,
          created_at: payload.new.created_at,
          reactions: payload.new.reactions ?? {},
        }

        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })

        // Si pas de l'utilisateur courant → incrémenter non-lus
        if (payload.new.sender_id !== currentUser?.id) {
          setUnreadCount(c => c + 1)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'admin_messages',
      }, payload => {
        setMessages(prev => prev.map(m => {
          if (m.id !== payload.new.id) return m
          return { ...m, is_pinned: payload.new.is_pinned, reactions: payload.new.reactions ?? m.reactions, deleted_at: payload.new.deleted_at }
        }))
        setPinnedMessages(prev => {
          const updated = prev.filter(m => m.id !== payload.new.id)
          if (payload.new.is_pinned && !payload.new.deleted_at) {
            updated.push({ ...prev.find(m => m.id === payload.new.id)!, is_pinned: true })
          }
          return updated
        })
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'admin_messages',
      }, payload => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        setPinnedMessages(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUser])

  // ── Auto-scroll ──────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setUnreadCount(0)
  }, [messages])

  // ── Envoyer un message ───────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || !currentUser || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)
    try {
      const { error } = await supabase.from('admin_messages').insert({
        content,
        sender_id: currentUser.id,
        is_pinned: false,
        reactions: {},
      })
      if (error) throw error
      // Mettre à jour last_seen
      await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id)
    } catch {
      toast.error('Erreur lors de l\'envoi')
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  // ── Supprimer un message (super admin ou auteur) ─────────────────
  async function deleteMessage(id: string, senderId: string) {
    if (!isSuperAdmin && senderId !== currentUser?.id) return
    if (!confirm('Supprimer ce message ?')) return
    await supabase.from('admin_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setMenuFor(null)
    toast('Message supprimé', { icon: '🗑️' })
  }

  // ── Épingler/désépingler (super admin uniquement) ────────────────
  async function togglePin(id: string, currentlyPinned: boolean) {
    if (!isSuperAdmin) { toast.error('Seul le super admin peut épingler des messages'); return }
    await supabase.from('admin_messages').update({
      is_pinned: !currentlyPinned,
      pinned_by: !currentlyPinned ? currentUser?.id : null,
    }).eq('id', id)
    setMenuFor(null)
    toast(currentlyPinned ? 'Message désépinglé' : 'Message épinglé 📌', { icon: '📌' })
  }

  // ── Réaction emoji ───────────────────────────────────────────────
  async function addReaction(msgId: string, emoji: string) {
    if (!currentUser) return
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return

    const reactions = { ...(msg.reactions ?? {}) }
    const users = reactions[emoji] ?? []
    const hasReacted = users.includes(currentUser.id)

    if (hasReacted) {
      reactions[emoji] = users.filter(u => u !== currentUser.id)
      if (reactions[emoji].length === 0) delete reactions[emoji]
    } else {
      reactions[emoji] = [...users, currentUser.id]
    }

    await supabase.from('admin_messages').update({ reactions }).eq('id', msgId)
    setShowEmojiFor(null)
  }

  // ── Grouper les messages par date ─────────────────────────────────
  const groupedMessages = messages.reduce((acc: { date: string; msgs: AdminMessage[] }[], msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    const last = acc[acc.length - 1]
    if (last && last.date === date) {
      last.msgs.push(msg)
    } else {
      acc.push({ date, msgs: [msg] })
    }
    return acc
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">

      {/* ── Sidebar membres ─────────────────────────────────────────── */}
      <div className={cn(
        'flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex flex-col transition-all',
        showMembers ? 'w-64' : 'w-0 overflow-hidden'
      )}>
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-gray-400" />
            <p className="font-semibold text-sm text-gray-800 dark:text-white">Membres ({members.length})</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {onlineIds.size} en ligne
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="relative flex-shrink-0">
                {m.avatar_url ? (
                  <Image src={m.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-500 dark:text-gray-300">
                    {m.full_name.charAt(0)}
                  </div>
                )}
                {/* Indicateur en ligne */}
                <span className={cn(
                  'absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white dark:border-gray-900',
                  onlineIds.has(m.id) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{m.full_name}</p>
                  {m.id === currentUser?.id && <span className="text-[9px] text-gray-400">(vous)</span>}
                </div>
                <RoleBadge role={m.role} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zone principale ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="w-9 h-9 bg-gradient-to-br from-[#f95d1e] to-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <MessageSquare size={16} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-gray-900 dark:text-white">Équipe Habynex</p>
            <p className="text-xs text-gray-400">
              {onlineIds.size} admin{onlineIds.size > 1 ? 's' : ''} en ligne · {messages.length} messages
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Pinned */}
            {pinnedMessages.length > 0 && (
              <button onClick={() => setShowPinned(!showPinned)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                  showPinned
                    ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                    : 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-300'
                )}>
                <Pin size={11} /> {pinnedMessages.length} épinglé{pinnedMessages.length > 1 ? 's' : ''}
              </button>
            )}
            {/* Membres */}
            <button onClick={() => setShowMembers(!showMembers)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                showMembers
                  ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-blue-300'
              )}>
              <Users size={11} /> Membres
            </button>
          </div>
        </div>

        {/* Messages épinglés */}
        {showPinned && pinnedMessages.length > 0 && (
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/10 border-b border-amber-100 dark:border-amber-900/30">
            <div className="flex items-center gap-2 mb-2">
              <Pin size={12} className="text-amber-500" />
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Messages épinglés</p>
            </div>
            <div className="space-y-1.5">
              {pinnedMessages.map(m => (
                <div key={m.id} className="flex items-start gap-2 bg-white dark:bg-gray-900 rounded-xl px-3 py-2 border border-amber-200 dark:border-amber-800/40">
                  <p className="text-xs font-medium text-[#f95d1e] flex-shrink-0">{m.sender_name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1 flex-1">{m.content}</p>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(m.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <MessageSquare size={40} className="text-gray-200 dark:text-gray-700" />
              <p className="text-sm font-medium">Aucun message encore</p>
              <p className="text-xs text-center">Soyez le premier à écrire dans le groupe admin Habynex !</p>
            </div>
          )}

          {groupedMessages.map(({ date, msgs }) => (
            <div key={date} className="space-y-3">
              {/* Séparateur date */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                <span className="text-[10px] font-semibold text-gray-400 capitalize">{date}</span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              </div>

              {msgs.map((msg, i) => {
                const isMine = msg.sender_id === currentUser?.id
                const isSameAsPrev = i > 0 && msgs[i - 1].sender_id === msg.sender_id
                const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0

                return (
                  <div key={msg.id}
                    className={cn('flex gap-3 group', isMine ? 'flex-row-reverse' : 'flex-row')}
                    onMouseLeave={() => { setMenuFor(null); setShowEmojiFor(null) }}>

                    {/* Avatar */}
                    {!isSameAsPrev ? (
                      <div className="flex-shrink-0 mt-1">
                        {msg.sender_avatar ? (
                          <Image src={msg.sender_avatar} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-500 dark:text-gray-300">
                            {msg.sender_name.charAt(0)}
                          </div>
                        )}
                      </div>
                    ) : <div className="w-8 flex-shrink-0" />}

                    {/* Bulle */}
                    <div className={cn('max-w-[72%] space-y-1', isMine ? 'items-end' : 'items-start', 'flex flex-col')}>
                      {/* Nom + rôle + heure */}
                      {!isSameAsPrev && (
                        <div className={cn('flex items-center gap-2 flex-wrap', isMine ? 'flex-row-reverse' : 'flex-row')}>
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.sender_name}</p>
                          <RoleBadge role={msg.sender_role} />
                          <span className="text-[10px] text-gray-400">{timeAgo(msg.created_at)}</span>
                          {msg.is_pinned && <span className="text-[10px] text-amber-500 flex items-center gap-0.5"><Pin size={8} />Épinglé</span>}
                        </div>
                      )}

                      {/* Message + actions */}
                      <div className={cn('relative flex items-end gap-1.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
                        <div className={cn(
                          'relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                          isMine
                            ? 'bg-[#f95d1e] text-white rounded-br-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white rounded-bl-sm',
                          msg.is_pinned && !isMine && 'border-l-2 border-amber-400'
                        )}>
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>

                        {/* Actions au survol */}
                        <div className={cn(
                          'flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
                          isMine ? 'flex-row-reverse' : 'flex-row'
                        )}>
                          {/* Emoji */}
                          <div className="relative">
                            <button
                              onClick={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-base">
                              😊
                            </button>
                            {showEmojiFor === msg.id && (
                              <div className={cn(
                                'absolute bottom-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-2 flex gap-1 z-20',
                                isMine ? 'right-0' : 'left-0'
                              )}>
                                {EMOJI_REACTIONS.map(emoji => (
                                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)}
                                    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg">
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Menu contextuel */}
                          <div className="relative">
                            <button
                              onClick={() => setMenuFor(menuFor === msg.id ? null : msg.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                              <MoreVertical size={13} />
                            </button>
                            {menuFor === msg.id && (
                              <div className={cn(
                                'absolute bottom-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden z-20 w-40',
                                isMine ? 'right-0' : 'left-0'
                              )}>
                                {/* Épingler — super admin uniquement */}
                                {isSuperAdmin && (
                                  <button onClick={() => togglePin(msg.id, msg.is_pinned)}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    {msg.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
                                    {msg.is_pinned ? 'Désépingler' : 'Épingler'}
                                  </button>
                                )}
                                {/* Supprimer — super admin ou auteur */}
                                {(isSuperAdmin || msg.sender_id === currentUser?.id) && (
                                  <button onClick={() => deleteMessage(msg.id, msg.sender_id)}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                                    <Trash2 size={12} /> Supprimer
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Réactions */}
                      {hasReactions && (
                        <div className={cn('flex flex-wrap gap-1', isMine ? 'justify-end' : 'justify-start')}>
                          {Object.entries(msg.reactions!).map(([emoji, userIds]) => (
                            userIds.length > 0 && (
                              <button key={emoji} onClick={() => addReaction(msg.id, emoji)}
                                className={cn(
                                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all',
                                  userIds.includes(currentUser?.id ?? '')
                                    ? 'bg-blue-100 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                                )}>
                                <span>{emoji}</span>
                                <span className="font-semibold">{userIds.length}</span>
                              </button>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Badge messages non lus */}
        {unreadCount > 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <button onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnreadCount(0) }}
              className="flex items-center gap-2 px-4 py-2 bg-[#f95d1e] text-white text-xs font-semibold rounded-full shadow-lg hover:bg-[#e04d0e] transition-colors">
              <ChevronDown size={14} /> {unreadCount} nouveau{unreadCount > 1 ? 'x' : ''} message{unreadCount > 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Zone de saisie */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          {isSuperAdmin && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <Crown size={11} className="text-amber-500" />
              <p className="text-[10px] text-amber-500 font-medium">Mode Super Admin — Vous pouvez épingler et supprimer n&apos;importe quel message</p>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Écrire un message à l'équipe… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
              rows={1}
              className="flex-1 resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#f95d1e] focus:ring-2 focus:ring-[#f95d1e]/20 transition-all text-gray-700 dark:text-white placeholder:text-gray-400"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-11 h-11 flex-shrink-0 bg-[#f95d1e] hover:bg-[#e04d0e] disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white rounded-2xl flex items-center justify-center transition-colors"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
