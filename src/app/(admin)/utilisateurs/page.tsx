import type { Metadata } from 'next'
import { UtilisateursPage } from '@/components/users/UtilisateursPage'
export const metadata: Metadata = { title: 'Utilisateurs' }
export default function Page() { return <UtilisateursPage /> }
