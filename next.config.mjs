import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // next-intl's extractor/format uses dynamic import(variable) which webpack's
    // FileSystemInfo cache scanner cannot statically resolve, emitting a noisy
    // but harmless warning every build. Suppress it via infrastructure logging.
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: 'error',
    }
    return config
  },
}

export default withNextIntl(nextConfig)
