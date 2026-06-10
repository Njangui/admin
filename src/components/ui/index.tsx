
'use client'
import React from 'react'
import { cn } from '@/lib/utils/index'
import { Loader2 } from 'lucide-react'

export function StatCard({ title, value, sub, icon: Icon, color, trend }: {
  title: string; value: string|number; sub?: string
  icon: React.ElementType; color: string; trend?: { value: number; label: string }
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', color)}>
          <Icon size={17} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mb-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      {trend && (
        <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium', trend.value >= 0 ? 'text-green-500' : 'text-red-500')}>
          <span>{trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
          <span className="text-gray-400 font-normal">{trend.label}</span>
        </div>
      )}
    </div>
  )
}

export function Badge({ label, color }: { label: string; color: string }) {
  return <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', color)}>{label}</span>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-[#f95d1e]" />
    </div>
  )
}

export function ActionButton({ label, onClick, variant = 'primary', size = 'md', disabled, loading: isLoading, icon: Icon }: {
  label: string; onClick?: () => void
  variant?: 'primary'|'secondary'|'danger'|'ghost'
  size?: 'sm'|'md'; disabled?: boolean; loading?: boolean; icon?: React.ElementType
}) {
  const variants = {
    primary: 'bg-[#222] hover:bg-[#333] text-white dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900',
    secondary: 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    ghost: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
  }
  const sizes = { sm:'px-3 py-1.5 text-xs', md:'px-4 py-2 text-sm' }
  return (
    <button onClick={onClick} disabled={disabled || isLoading}
      className={cn('inline-flex items-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed', variants[variant], sizes[size])}>
      {isLoading ? <Loader2 size={14} className="animate-spin"/> : Icon ? <Icon size={14}/> : null}
      {label}
    </button>
  )
}
