import type { Metadata } from 'next'
import { CommissionsPage } from '@/components/commissions/CommissionsPage'
export const metadata: Metadata = { title: 'Commissions' }
export default function Page() { return <CommissionsPage /> }
