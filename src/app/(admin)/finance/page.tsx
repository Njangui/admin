import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FinancePage } from '@/components/finance/FinancePage'

export const metadata: Metadata = { title: 'Finance & Revenus' }

export default function Page() {
  return <Suspense><FinancePage /></Suspense>
}
