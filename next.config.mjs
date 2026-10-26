/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Keep Next.js lint/type checks active; do not ship a broken build.
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 90],
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/pagina%20principal%20con%20efecto/index.html' }],
      afterFiles: ['', 'el-taller', 'pablo-martinez', 'inscripcion', 'contacto', 'recursos', 'preguntas-frecuentes'].map(page => ({
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
      ...['/admin', '/admin/:path*', '/api/auth/:path*'].map(source => ({
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
