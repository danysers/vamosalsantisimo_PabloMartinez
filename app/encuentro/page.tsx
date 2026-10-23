import Image from 'next/image'
import Link from 'next/link'
import { buildWhatsAppLink, organizationWhatsApp } from '../../lib/whatsapp-link'

const assets = '/2026'

export default function Home() {
  return (
    <>
      <header className="site-header">
        <nav className="navigation" aria-label="Navegación principal">
          <Link href="/" className="brand" aria-label="Vamos al Santísimo, inicio">
            <Image src={`${assets}/logo.webp`} alt="" width={62} height={46} priority />
            <span>Vamos al<br />Santísimo</span>
          </Link>
          <div className="navigation-links">
            <a href="#evento">Adoración</a>
            <a href="#taller">Taller</a>
            <a href="#pablo">Pablo Martínez</a>
            <a href="#contacto">Contacto</a>
          </div>
        </nav>
      </header>

      <main id="inicio">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">Un encuentro de fe y música · 2026</p>
              <h1 id="hero-title">Vamos al <em>Santísimo</em></h1>
              <p className="hero-subtitle">Adoración con Pablo Martínez</p>
              <p className="hero-date"><time dateTime="2026-12-19">Sábado 19 de diciembre de 2026</time></p>
              <p className="hero-location">20:00 h · Lugar a confirmar · Entrada gratuita</p>
              <a href="#evento" className="button button-gold">Conocé el encuentro <span aria-hidden="true">→</span></a>
            </div>
            <Image className="hero-art" src={`${assets}/custodia.webp`} alt="Ilustración de custodia y altar" width={780} height={845} priority sizes="(max-width: 700px) 75vw, 45vw" />
          </div>
        </section>

        <section className="events section-width" id="evento" aria-labelledby="events-title">
          <p className="eyebrow">El mismo día, dos experiencias</p>
          <h2 id="events-title">Una tarde de música. Una noche de adoración.</h2>
          <div className="event-grid">
            <article className="event-card concert">
              <span className="card-symbol" aria-hidden="true">✧</span>
              <h3>Adoración</h3>
              <p>Un encuentro para compartir la fe y la música junto a Pablo Martínez.</p>
              <p className="card-details"><time dateTime="2026-12-19T20:00:00-03:00">19 de diciembre · 20:00 h</time><br />Lugar a confirmar</p>
              <strong className="entry-label">Entrada gratuita</strong>
            </article>
            <article className="event-card workshop">
              <span className="card-symbol" aria-hidden="true">♫</span>
              <h3>Taller para músicos</h3>
              <p>Un espacio de formación para quienes sirven con la música en sus comunidades.</p>
              <p className="card-details"><time dateTime="2026-12-19T17:00:00-03:00">19 de diciembre · 17:00 h</time><br />Lugar y programa: a confirmar</p>
              <a href="#taller" className="button button-outline">Conocer el taller <span aria-hidden="true">→</span></a>
            </article>
          </div>
        </section>

        <section className="values" aria-labelledby="values-title">
          <div className="section-width">
            <p className="eyebrow">La invitación</p>
            <h2 id="values-title">Una experiencia para compartir</h2>
            <div className="values-grid">
              <div><span aria-hidden="true">♫</span><h3>Música</h3><p>Un lenguaje para orar y encontrarnos.</p></div>
              <div><span aria-hidden="true">✝</span><h3>Encuentro</h3><p>Una noche de comunidad y adoración.</p></div>
              <div><span aria-hidden="true">♡</span><h3>Fe</h3><p>Un espacio abierto para acercarse y compartir.</p></div>
            </div>
            <div className="info-grid">
              <div><h3>Cómo llegar</h3><p>El lugar de la adoración está por confirmar. Compartiremos la dirección exacta cuando esté confirmada.</p></div>
              <div><h3>Preguntas frecuentes</h3><p>El taller comienza a las 17:00 h y la adoración a las 20:00 h. Los detalles de acceso y el programa se publicarán aquí.</p></div>
            </div>
          </div>
        </section>

        <section className="workshop-section" id="taller" aria-labelledby="workshop-title">
          <div className="section-width workshop-layout">
            <div>
              <p className="eyebrow dark">Formación · 17:00 h</p>
              <h2 id="workshop-title">Taller para <em>músicos</em></h2>
              <p>Un espacio para quienes desean profundizar en el servicio musical. El programa, el lugar y los materiales están pendientes de confirmación.</p>
              <div className="price-list" aria-label="Aranceles previstos por lote">
                <div><span>Primer lote</span><strong>$ 10.000</strong></div>
                <div><span>Segundo lote</span><strong>$ 15.000</strong></div>
                <div><span>Tercer lote</span><strong>$ 20.000</strong></div>
              </div>
              <p className="small-note">Valores en pesos argentinos. El taller no tiene límite de cupos. La organización habilitará manualmente cada lote; su disponibilidad y fechas de apertura se publicarán aquí.</p>
            </div>
            <aside className="registration-card" aria-labelledby="registration-title">
              <h3 id="registration-title">Inscripción al taller</h3>
              <p>Las inscripciones y los pagos todavía no están habilitados. No ingreses datos personales ni realices pagos por enlaces no publicados oficialmente.</p>
              <Link href="/inscripcion" className="button button-burgundy">Ver estado de inscripciones</Link>
              <p className="small-note">¿Tenés preguntas? <a href={buildWhatsAppLink(organizationWhatsApp)} target="_blank" rel="noopener noreferrer">Consultá por WhatsApp</a> al <strong>3704258770</strong>. Revisás el mensaje antes de enviarlo; abrir el chat no inscribe, reserva ni confirma un pago.</p>
              <p className="small-note">La adoración es gratuita y no requiere pagar el taller.</p>
            </aside>
          </div>
        </section>

        <section className="artist-section" id="pablo" aria-labelledby="artist-title">
          <div className="section-width artist-layout">
            <figure>
              <Image src={`${assets}/artist.webp`} alt="Ilustración conceptual de un músico con micrófono; no es una fotografía oficial de Pablo Martínez" width={800} height={534} sizes="(max-width: 700px) 90vw, 45vw" />
              <figcaption>Imagen conceptual; pendiente de fotografía oficial.</figcaption>
            </figure>
            <div>
              <p className="eyebrow">Invitado especial</p>
              <h2 id="artist-title">Pablo Martínez</h2>
              <p>Nos acompañará en esta jornada de música y adoración. La biografía y las redes oficiales se publicarán cuando estén aprobadas.</p>
            </div>
          </div>
        </section>
      </main>

      <footer id="contacto" className="footer">
        <div className="section-width footer-content">
          <Image src={`${assets}/logo.webp`} alt="Vamos al Santísimo" width={100} height={74} sizes="100px" />
          <p>19 de diciembre de 2026 · Horarios de Argentina (Buenos Aires)</p>
          <p>Consultas por WhatsApp: <a href={buildWhatsAppLink(organizationWhatsApp)} target="_blank" rel="noopener noreferrer">+54 9 3704 25-8770</a>. No enviamos mensajes automáticamente.</p>
          <small>© 2026 Vamos al Santísimo · Sitio en preparación</small>
        </div>
      </footer>
    </>
  )
}


