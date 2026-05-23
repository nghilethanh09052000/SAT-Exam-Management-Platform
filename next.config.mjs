import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14 option (renamed to serverExternalPackages in Next.js 15).
  // Prevents webpack from bundling pdf-parse / pdfjs-dist — bundling pdfjs-dist
  // causes a runtime crash because it tries to require('./pdf.worker.mjs') which
  // doesn't exist in the webpack output. Marking them external lets Node.js load
  // them natively, and Vercel's nft file-tracer still picks them up via the
  // require('pdf-parse') call in lib/parsers/pdf-parser.ts.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  },
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
