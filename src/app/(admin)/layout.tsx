import React from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'

export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>
}
