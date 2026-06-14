import { AdminChat } from '@/components/chat/AdminChat'

export default function GroupePage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
        💬 Groupe Habynex
      </h1>
      <AdminChat />
    </div>
  )
}
