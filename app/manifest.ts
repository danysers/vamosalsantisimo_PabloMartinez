import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vamos al Santísimo · Pablo Martínez 2026',
    short_name: 'Vamos al Santísimo',
    description: 'Adoración y taller de músicos · 19 de diciembre de 2026',
    start_url: '/',
    display: 'browser',
    background_color: '#17070a',
    theme_color: '#390b12',
    icons: [{ src: '/favicon-mark.png', sizes: 'any', type: 'image/png' }],
  }
}
