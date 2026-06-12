import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // isomorphic-dompurify pulls in jsdom, which cannot be bundled — it must be
  // loaded from node_modules at runtime in the serverless function
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
