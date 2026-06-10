import type { Metadata } from 'next'
import { AgentsPage } from '@/components/agents/AgentsPage'
export const metadata: Metadata = { title: 'Agents' }
export default function Page() { return <AgentsPage /> }
