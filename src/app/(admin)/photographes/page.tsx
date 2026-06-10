import type { Metadata } from 'next'
import { PhotographesPage } from '@/components/photographes/PhotographesPage'
export const metadata: Metadata = { title: 'Photographes' }
export default function Page() { return <PhotographesPage /> }
