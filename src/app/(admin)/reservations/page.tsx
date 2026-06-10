import type { Metadata } from 'next'
import { ReservationsPage } from '@/components/bookings/ReservationsPage'
export const metadata: Metadata = { title: 'Réservations' }
export default function Page() { return <ReservationsPage /> }
