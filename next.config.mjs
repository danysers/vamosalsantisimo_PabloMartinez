import { fileURLToPath } from 'node:url'
import { contentPolicy, staticScriptHashes } from './lib/browser-security.mjs'
/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: 'standalone',
  poweredByHeader: false,
  ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Math.max(1, Math.min(2, Number(process.env.NEXT_BUILD_CPUS) || 1)) } } : {}),
  // Keep Next.js lint/type checks active; do not ship a broken build.
  images: {
    localPatterns: [{ pathname: '/2026/**', search: '' }, { pathname: '/_next/static/media/**', search: '' }],
    remotePatterns: [],
    maximumRedirects: 0,
    dangerouslyAllowSVG: false,
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 90],
  },
  async redirects() {
    return [
      { source: '/:path*', has: [{ type: 'host', value: 'www.vamosalsantisimo.com' }], destination: 'https://vamosalsantisimo.com/:path*', permanent: true },
      { source: '/taller', destination: '/formacion', permanent: true },
      { source: '/taller/:path*', destination: '/formacion/:path*', permanent: true },
      { source: '/formacion/el-taller', destination: '/formacion/inscripcion', permanent: true },
      // Keep the unfinished biography in the repository, but out of public navigation for now.
      { source: '/formacion/pablo-martinez', destination: '/formacion', permanent: false },
      { source: '/formacion/pablo-martinez/index.html', destination: '/formacion', permanent: false },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/pagina%20principal%20con%20efecto/index.html' },
        // Keep the image in previously delivered workshop emails available.
        { source: '/logo-vamos.png', destination: '/eventos-anteriores/logo-vamos.png' },
      ],
      afterFiles: ['', 'inscripcion', 'pago', 'comprobante', 'contacto', 'recursos', 'preguntas-frecuentes'].map(page => ({
        source: page ? `/formacion/${page}` : '/formacion',
        destination: page ? `/formacion/${page}/index.html` : '/formacion/index.html',
      })),
    }
  },
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=()' },
        { key: 'Content-Security-Policy', value: "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
      ] },
      ...['/', '/formacion/:path*', '/pagina%20principal%20con%20efecto/:path*', '/eventos-anteriores/:path*'].map(source => ({
        source, headers: [{ key: 'Content-Security-Policy', value: contentPolicy(staticScriptHashes(fileURLToPath(new URL('./public', import.meta.url))).join(' ')) }],
      })),
      {
        source: '/2026/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      ...['/admin', '/admin/:path*', '/api/admin/:path*', '/api/auth/:path*'].map(source => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      })),
    ]
  },
}

export default nextConfig
