import type { Metadata } from 'next'
import { ConversationsAdmin } from '@/components/conversations/ConversationsAdmin'
export const metadata: Metadata = { title: 'Conversations' }
export default function Page() { return <ConversationsAdmin /> }
