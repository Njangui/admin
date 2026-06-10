import type { Metadata } from 'next'
import { AnnoncesPage } from '@/components/listings/AnnoncesPage'
export const metadata: Metadata = { title: 'Annonces' }
export default function Page() { return <AnnoncesPage /> }
