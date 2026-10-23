import type { Metadata } from 'next'
import './globals.css'
import './event.css'
import '../public/page-transition.css'

export const metadata: Metadata = {
  title: 'Vamos al Santísimo · Pablo Martínez · 19 de diciembre de 2026',
  description: 'Adoración gratuita con Pablo Martínez el 19 de diciembre a las 20 h, lugar a confirmar. Taller de músicos a las 17 h; inscripciones aún no disponibles.',
  robots: { index: false, follow: false }, // Remove only after the organization confirms publication.
  openGraph: {
    title: 'Vamos al Santísimo · Pablo Martínez',
    description: 'Adoración el sábado 19 de diciembre de 2026 a las 20 h; taller de músicos a las 17 h.',
    type: 'website',
    locale: 'es_AR',
  },
  icons: { icon: '/favicon-mark.png' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR" data-scroll-behavior="smooth" suppressHydrationWarning><head>
    <script dangerouslySetInnerHTML={{ __html: `try{const k='vas-page-transition',v=JSON.parse(sessionStorage.getItem(k)||'null');sessionStorage.removeItem(k);if(v&&Date.now()-v.at<10000&&v.path.replace(/\\/$/,'')===location.pathname.replace(/\\/$/,'')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.siteNavigation='entering'}catch{}` }} />
    <script src="/page-transition.js" defer />
  </head><body>{children}</body></html>
}
