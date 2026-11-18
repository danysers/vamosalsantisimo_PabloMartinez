import { publicMetadata } from '../../lib/seo'
import SeoJsonLd from '../../components/seo-jsonld'
import { ArrowUpRight, Heart, Megaphone, MessageCircle, MonitorPlay, UsersRound } from 'lucide-react'
import SupportPageShell from '../../components/support-page-shell'
import shared from '../../components/community-support.module.css'
import styles from './page.module.css'

export const metadata = publicMetadata('/sumar-marca')

const whatsapp = `https://wa.me/5493704049719?text=${encodeURIComponent('Hola, quiero sumar mi marca como bienhechor de Vamos al Santísimo 2026. ¿Podemos conversar sobre el aporte y cómo acompañar el encuentro?')}`

const acknowledgements = [
  { title: 'Oración y gratitud', description: 'Presentaremos ante Jesús Eucaristía las intenciones de quienes acompañen esta noche.', Icon: Heart },
  { title: 'Presencia en el encuentro', description: 'Agradecimiento público y presencia de la marca en pantalla, según lo que acordemos.', Icon: UsersRound },
  { title: 'Difusión en redes', description: 'Menciones y presencia en las publicaciones de la convocatoria y del encuentro.', Icon: Megaphone },
  { title: 'Después de la noche', description: 'Agradecimiento en los videos de cierre que compartiremos en nuestras plataformas.', Icon: MonitorPlay },
]

export default function BrandSupportPage() {
  return <SupportPageShell current="marcas" backHref="/#colabora">
    <SeoJsonLd path="/sumar-marca" />

    <header className={shared.pageHeading}>
      <p className={shared.overline}>Invitación a bienhechores · 2026</p>
      <h1>Sumá tu marca<br /> al encuentro.</h1>
      <p>Tu aporte hace posible una noche de adoración, alabanza y encuentro con Jesús Eucaristía, abierta a toda la comunidad y con la participación de Pablo Martínez.</p>
    </header>

    <div className={styles.eventFacts} aria-label="Datos del encuentro">
      <p><time dateTime="2026-12-19T19:00:00-03:00">Sábado 19 de diciembre · 19:00 h</time></p>
      <p>Formosa · Entrada libre y gratuita</p>
    </div>

    <section className={styles.purpose} aria-labelledby="purpose-title">
      <p className={shared.overline}>Nuestro propósito</p>
      <h2 id="purpose-title">Una noche para encontrarnos con Jesús.</h2>
      <p>Queremos reunir a familias, jóvenes, comunidades parroquiales y movimientos de la región para adorar a Jesús presente en la Eucaristía. También invitamos a quienes desean volver a la fe o todavía no conocen al Señor.</p>
      <div className={styles.mission} aria-label="Los tres pilares del encuentro">
        <div><h3>Adoración</h3><p>A los pies de Jesús presente en la Eucaristía.</p></div>
        <div><h3>Alabanza</h3><p>Música y oración compartidas en comunidad.</p></div>
        <div><h3>Evangelización</h3><p>Una invitación a acercarse y volver a Jesús.</p></div>
      </div>
    </section>

    <section className={styles.reach} aria-labelledby="reach-title">
      <p className={shared.overline}>Una convocatoria que crece</p>
      <h2 id="reach-title">El encuentro ya se está compartiendo.</h2>
      <div className={styles.figures}>
        <p><strong>5.000+</strong><span>personas esperadas (proyección)</span></p>
        <p><strong>33.700+</strong><span>visualizaciones de la convocatoria</span></p>
        <p><strong>3.500+</strong><span>seguidores en Instagram</span></p>
      </div>
      <p className={styles.source}>Cifras de Instagram aportadas por la organización. La asistencia presencial es una proyección, no una cifra confirmada.</p>
    </section>

    <section className={styles.support} aria-labelledby="support-title">
      <div className={styles.supportIntro}>
        <p className={shared.overline}>Bienhechores 2026</p>
        <h2 id="support-title">Tu aporte hace posible una noche que transforma.</h2>
        <p>Este encuentro es gratuito. La colaboración ayuda a cubrir sonido, pantalla, iluminación, escenario y logística para recibir a más personas.</p>
        <div className={styles.amount}>
          <span>Aporte de colaboración</span>
          <strong>$50.000</strong>
          <small>Pesos argentinos · Transferencia o efectivo</small>
        </div>
      </div>
      <div className={styles.acknowledgements}>
        <h3>Así agradecemos a quienes nos acompañan</h3>
        <ul>
          {acknowledgements.map(({ title, description, Icon }) => <li key={title}>
            <Icon size={22} strokeWidth={1.4} aria-hidden="true" />
            <div><h4>{title}</h4><p>{description}</p></div>
          </li>)}
        </ul>
      </div>
    </section>

    <section className={`${shared.join} ${styles.contact}`} aria-labelledby="contact-brand-title">
      <p className={shared.overline}>Conversemos</p>
      <h2 id="contact-brand-title">Sumá tu marca al encuentro</h2>
      <p>Cada aporte suma. Contactá al equipo y encontremos juntos una manera de acompañar esta noche de fe, música y comunidad.</p>
      <a className={shared.primaryButton} href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />Quiero sumar mi marca <ArrowUpRight size={16} aria-hidden="true" /></a>
      <p className={shared.small}>Por WhatsApp coordinamos el aporte y los detalles de la participación de tu marca.</p>
    </section>
  </SupportPageShell>
}
