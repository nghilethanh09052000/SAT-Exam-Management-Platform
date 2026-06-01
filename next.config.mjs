import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const ignoredWatchPaths =
  /^((?:[^/]*(?:\/|$))*)(\.(git|next|codegraph)|node_modules)(\/((?:[^/]*(?:\/|$))*)(?:$|\/))?/

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14 option (renamed to serverExternalPackages in Next.js 15).
  // Prevents webpack from bundling pdf-parse so Vercel's nft file-tracer can
  // include the bundled pdfjs copy (lib/pdf.js/…) that ships inside the package.
  // pdf-parse v1 bundles its own pdfjs (v2, pure Node.js) — no separate
  // pdfjs-dist dep, no worker file, no DOMMatrix requirement.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ignoredWatchPaths,
    }

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
