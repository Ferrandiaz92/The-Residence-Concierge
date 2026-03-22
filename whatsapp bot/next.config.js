/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['twilio', '@anthropic-ai/sdk']
  }
}

module.exports = nextConfig
