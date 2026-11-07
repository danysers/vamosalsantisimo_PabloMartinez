export const siteOrigin = 'https://vamosalsantisimo.com'
export const eventPoster = '/pagina%20principal%20con%20efecto/assets/invitacion-vamos-al-santisimo-2026-final.png'
export const publicPages = {
  '/': { title: 'Pablo Martínez en Formosa 2026 | Vamos al Santísimo', description: 'Vamos al Santísimo con Pablo Martínez: 19 de diciembre de 2026, desde las 19 h en el Anfiteatro de la Juventud, Formosa. Entrada libre y gratuita.' },
  '/formacion': { title: 'Taller de música con Pablo Martínez en Formosa | 2026', description: 'Taller presencial de música con Pablo Martínez: 19 de diciembre de 2026 a las 15 h, Parroquia San Luis de Francia, Formosa. Conocé el encuentro e inscribite.' },
  '/formacion/inscripcion': { title: 'Inscripción al taller de Pablo Martínez en Formosa | 2026', description: 'Inscribite al taller de música de Pablo Martínez en Formosa, el 19 de diciembre de 2026 a las 15 h. Consultá el precio vigente y los medios de pago.' },
  '/formacion/contacto': { title: 'Contacto y medios de pago del taller | Vamos al Santísimo', description: 'Consultá los medios de pago y contactá a Vamos al Santísimo por el taller de música con Pablo Martínez en Formosa. Transferencia, QR, Mercado Pago y efectivo.' },
  '/formacion/preguntas-frecuentes': { title: 'Preguntas sobre el taller de Pablo Martínez | Formosa 2026', description: 'Fecha, horario, ubicación, inscripción y medios de pago del taller de música con Pablo Martínez en Formosa: respuestas del equipo organizador.' },
  '/donaciones': { title: 'Colaborá con Vamos al Santísimo en Formosa | Donaciones', description: 'Acompañá la organización de Vamos al Santísimo con Pablo Martínez en Formosa. Conocé los datos y medios disponibles para hacer tu aporte voluntario.' },
  '/voluntarios': { title: 'Voluntarios para Vamos al Santísimo | Formosa 2026', description: 'Sumate al equipo de voluntarios de Vamos al Santísimo en Formosa. Colaborá en la preparación del encuentro con Pablo Martínez del 19 de diciembre de 2026.' },
  '/sumar-marca': { title: 'Sumá tu marca a Vamos al Santísimo | Sponsors Formosa', description: 'Acompañá el encuentro Vamos al Santísimo en Formosa con tu marca, productos o servicios. Contactá al equipo organizador para conocer las formas de colaborar.' },
}

export const organization = {
  '@type': 'Organization', '@id': `${siteOrigin}/#organizacion`, name: 'Vamos al Santísimo', url: `${siteOrigin}/`,
  logo: `${siteOrigin}/2026/logo.webp`, email: 'contactos@vamosalsantisimo.com',
  sameAs: ['https://www.instagram.com/vamosalsantisimof/', 'https://www.facebook.com/vamosalsantisimof/', 'https://www.tiktok.com/@vamosalsantisimo'],
}

export function structuredDataFor(path) {
  const page = publicPages[path]
  if (!page) return null
  const url = siteOrigin + path
  const graph = [organization,
    { '@type': 'WebSite', '@id': `${siteOrigin}/#sitio`, url: `${siteOrigin}/`, name: 'Vamos al Santísimo', inLanguage: 'es-AR', publisher: { '@id': organization['@id'] } },
    { '@type': 'WebPage', '@id': `${url}#pagina`, url, name: page.title, description: page.description, inLanguage: 'es-AR', isPartOf: { '@id': `${siteOrigin}/#sitio` } },
  ]
  if (path !== '/') graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Vamos al Santísimo', item: `${siteOrigin}/` },
    ...(path.startsWith('/formacion/') ? [{ '@type': 'ListItem', position: 2, name: 'Taller de música', item: `${siteOrigin}/formacion` }] : []),
    { '@type': 'ListItem', position: path.startsWith('/formacion/') ? 3 : 2, name: path === '/formacion' ? 'Taller de música' : page.title.split(' | ')[0], item: url },
  ] })
  if (path === '/' || path === '/formacion') {
    const workshop = path === '/formacion'
    graph.push({ '@type': workshop ? 'EducationEvent' : 'MusicEvent', '@id': `${url}#evento`, url,
      name: workshop ? 'Taller de música con Pablo Martínez en Formosa' : 'Vamos al Santísimo con Pablo Martínez en Formosa',
      description: page.description, startDate: `2026-12-19T${workshop ? '15' : '19'}:00:00-03:00`,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      isAccessibleForFree: !workshop, inLanguage: 'es-AR', organizer: { '@id': organization['@id'] },
      performer: { '@type': 'Person', name: 'Pablo Martínez' },
      image: [siteOrigin + (workshop ? '/2026/optimized/pablo-taller-20261106.webp' : eventPoster)],
      location: { '@type': 'Place', name: workshop ? 'Parroquia San Luis de Francia' : 'Anfiteatro de la Juventud',
        address: { '@type': 'PostalAddress', streetAddress: workshop ? 'Paraguay 260' : 'Av. Napoleón Uriburu y Av. 9 de Julio', addressLocality: 'Formosa', addressRegion: 'Formosa', addressCountry: 'AR' },
        ...(!workshop ? { geo: { '@type': 'GeoCoordinates', latitude: -26.1936919, longitude: -58.1701572 } } : {}),
      },
      ...(!workshop ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'ARS', url } } : {}),
    })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}
