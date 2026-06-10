import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  poweredByHeader: false,
}
export default nextConfig
