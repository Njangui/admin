import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AgentCommercialPage } from '@/components/agent-commercial/AgentCommercialPage'
export const metadata: Metadata = { title: 'Agent Commercial' }
export default function Page() {
  return <Suspense><AgentCommercialPage /></Suspense>
}
