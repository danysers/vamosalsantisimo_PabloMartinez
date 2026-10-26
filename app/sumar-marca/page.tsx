import type { Metadata } from 'next'
import { ArrowUpRight, HandHeart, Lightbulb, Mail, MessageCircle, Phone, Truck, UsersRound } from 'lucide-react'
import SupportPageShell from '../../components/support-page-shell'
import shared from '../../components/community-support.module.css'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'Sumá tu marca al encuentro · Vamos al Santísimo',
  description: 'Acompañá Vamos al Santísimo con tu marca, productos o servicios. Conocé cómo colaborar y contactá al equipo organizador.',
}

const whatsapp = `https://wa.me/5493704258770?text=${encodeURIComponent('Hola, me gustaría sumar mi marca a Vamos al Santísimo. ¿Podemos conversar sobre las formas de acompañar el encuentro?')}`

export default function BrandSupportPage() {
  return <SupportPageShell current="marcas" backHref="/#colabora">
    <header className={shared.pageHeading}>
      <p className={shared.overline}>Marcas que nos acompañan en este encuentro</p>
      <h1>Tu marca también<br /> puede ser parte.</h1>
      <p>Preparar una noche de fe, música y comunidad requiere muchas manos y recursos. Tu comercio, empresa o emprendimiento puede ayudarnos a hacer posible este encuentro y a recibir a quienes se acerquen a compartirlo.</p>
    </header>

    <div className={shared.volunteerIntro}><p>Una de las maneras de colaborar es <strong>sumar tu marca al encuentro</strong>. Podemos conversar sobre un aporte económico, productos o servicios que acompañen las necesidades de la organización.</p></div>

    <section className={styles.section} aria-labelledby="expenses-title">
      <div className={styles.sectionHeading}><p className={shared.overline}>Lo que hay detrás de cada encuentro</p><h2 id="expenses-title">Muchos detalles.<br />Un mismo propósito.</h2><p>Para que podamos vivir esta experiencia juntos, hay que prever gastos y tareas como estos:</p></div>
      <div className={shared.volunteerGrid}>
        <article className={shared.detailCard}><Lightbulb className={shared.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h3>Sonido, iluminación y equipos</h3><p>Preparar los recursos técnicos para que la música y la palabra lleguen con claridad, y acompañar el trabajo de quienes los ponen en funcionamiento.</p></article>
        <article className={shared.detailCard}><Truck className={shared.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h3>Traslados y logística</h3><p>Coordinar el movimiento de personas, materiales y equipos, junto con el armado, la preparación y el orden del espacio.</p></article>
        <article className={shared.detailCard}><UsersRound className={shared.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h3>Recepción y organización</h3><p>Prever señalización, materiales de trabajo, limpieza y recursos para que los equipos de servicio puedan recibir y acompañar a la comunidad.</p></article>
        <article className={shared.detailCard}><HandHeart className={shared.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h3>Agua, insumos y otros aportes</h3><p>Los productos y servicios también pueden ser una gran ayuda. Conversamos con cada marca para encontrar una forma de colaborar acorde a lo que puede ofrecer y a lo que el encuentro necesita.</p></article>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="how-title">
      <div className={styles.sectionHeading}><p className={shared.overline}>Hagámoslo posible juntos</p><h2 id="how-title">¿Cómo puede sumarse tu marca?</h2></div>
      <ol className={styles.steps}>
        <li><span aria-hidden="true">01</span><div><h3>Contanos quiénes son</h3><p>Escribinos con el nombre de tu marca, a qué se dedica y qué tipo de colaboración les gustaría ofrecer.</p></div></li>
        <li><span aria-hidden="true">02</span><div><h3>Busquemos una forma de acompañar</h3><p>El equipo organizador te compartirá las necesidades y coordinará con vos el aporte, los tiempos y los detalles.</p></div></li>
        <li><span aria-hidden="true">03</span><div><h3>Compartamos el agradecimiento</h3><p>También conversaremos sobre la presencia de tu marca entre quienes nos acompañan y la forma de reconocer su colaboración.</p></div></li>
      </ol>
    </section>

    <section className={`${shared.join} ${styles.contact}`} aria-labelledby="contact-brand-title">
      <p className={shared.overline}>Conversemos</p><h2 id="contact-brand-title">Sumá tu marca al encuentro</h2>
      <p>Cada aporte suma. Contactá al equipo y encontremos juntos una manera de acompañar esta noche de fe, música y comunidad.</p>
      <div className={styles.contacts}>
        <a href="tel:+543704258770"><Phone size={18} aria-hidden="true" /><span>3704258770</span></a>
        <a href="mailto:contactos@vamosalsantisimo.com"><Mail size={18} aria-hidden="true" /><span>contactos@vamosalsantisimo.com</span></a>
      </div>
      <div className={styles.actions}>
        <a className={shared.primaryButton} href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />Quiero sumar mi marca <ArrowUpRight size={16} aria-hidden="true" /></a>
        <a className={shared.outlineButton} href="tel:+543704258770"><Phone size={17} aria-hidden="true" />Llamar al equipo</a>
      </div>
      <p className={shared.small}>Gracias por poner lo que hacés al servicio de un encuentro que construimos entre todos.</p>
    </section>
  </SupportPageShell>
}
