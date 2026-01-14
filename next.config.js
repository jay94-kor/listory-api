/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better API routes
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // For large audio files info
    },
  },
}

module.exports = nextConfig
