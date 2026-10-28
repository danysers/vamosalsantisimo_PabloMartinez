/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: 'standalone',
  ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Math.max(1, Math.min(2, Number(process.env.NEXT_BUILD_CPUS) || 1)) } } : {}),
  // Keep Next.js lint/type checks active; do not ship a broken build.
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 90],
  },
  async redirects() {
    return [{ source: '/formacion/el-taller', destination: '/formacion/inscripcion', permanent: true }]
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/pagina%20principal%20con%20efecto/index.html' }],
      afterFiles: ['', 'pablo-martinez', 'inscripcion', 'pago', 'comprobante', 'contacto', 'recursos', 'preguntas-frecuentes'].map(page => ({
        source: page ? `/formacion/${page}` : '/formacion',
        destination: page ? `/formacion/${page}/index.html` : '/formacion/index.html',
      })),
    }
  },
  async headers() {
    return [
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
