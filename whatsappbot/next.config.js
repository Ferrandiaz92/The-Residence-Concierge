/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['twilio', '@anthropic-ai/sdk', 'stripe', 'web-push']
  }
}

module.exports = nextConfig
