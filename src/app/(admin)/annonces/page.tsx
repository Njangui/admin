import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AnnoncesPage } from '@/components/listings/AnnoncesPage'
export const metadata: Metadata = { title: 'Annonces' }
export default function Page() {
  return <Suspense><AnnoncesPage /></Suspense>
}
