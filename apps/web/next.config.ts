import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@ai-sales/types'],
  output: 'standalone',
}

export default config
