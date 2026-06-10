import type { Metadata } from 'next'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
export const metadata: Metadata = { title: "Vue d'ensemble" }
export default function Page() { return <DashboardOverview /> }
