import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ReservationsPage } from '@/components/bookings/ReservationsPage'
export const metadata: Metadata = { title: 'Réservations' }
export default function Page() {
  return <Suspense><ReservationsPage /></Suspense>
}
