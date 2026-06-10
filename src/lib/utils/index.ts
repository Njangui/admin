import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatPrice(amount: number, compact = false): string {
  if (compact && amount >= 1_000_000) return `${(amount/1_000_000).toFixed(1)}M FCFA`
  if (compact && amount >= 1_000) return `${(amount/1_000).toFixed(0)}k FCFA`
  return new Intl.NumberFormat('fr-CM').format(amount) + ' FCFA'
}

export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString('fr-FR', opts ?? { day:'numeric', month:'short', year:'numeric' })
}

export function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h/24)}j`
}
