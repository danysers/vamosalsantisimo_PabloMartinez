import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, MessageCircle } from 'lucide-react'
import { organizationWhatsApp } from '../lib/whatsapp-link'
import styles from './site-footer.module.css'

const questions = [
  { title: '¿La adoración tiene costo?', answer: 'La adoración es gratuita. El taller de músicos tiene un pequeño costo; te recomendamos inscribirte antes, aunque también vas a poder anotarte en el lugar el mismo día. No hace falta participar del taller para asistir a la adoración.' },
  { title: '¿Cuándo es el encuentro?', answer: 'El sábado 19 de diciembre de 2026, a las 20:00 h. El lugar está por confirmar; compartiremos la dirección exacta más adelante.' },
  { title: '¿Cómo me inscribo al taller?', answer: 'Te recomendamos hacer la inscripción previa cuando se habilite el formulario. Si no llegás a inscribirte antes, también vas a poder anotarte en el lugar el mismo día del taller.' },
  { title: '¿Puedo llevar algo para estar más cómodo y alabar?', answer: 'Sí. Podés llevar una silleta, agua, un anotador, una pandereta u otros instrumentos para alabar al Señor; lo que te ayude a estar más cómodo.' },
]

export default function SiteFooter() {
  const whatsapp = `https://wa.me/${organizationWhatsApp}?text=${encodeURIComponent('Hola, quiero consultar por Vamos al Santísimo con Pablo Martínez.')}`
  return (
    <footer className={styles.footer} id="contacto">
      <section className={styles.photoSection} aria-labelledby="footer-faq-title">
        <Image className={styles.photo} src="/2026/footer/escenario-original-alta.jpg" alt="Pablo Martínez junto a los músicos y el público durante un encuentro en vivo" fill sizes="100vw" quality={90} />
        <div className={styles.shade} aria-hidden="true" />
        <div className={styles.intro}>
          <span className={styles.overline}>Nos encontramos en la fe</span>
          <h2 id="footer-faq-title">Preguntas frecuentes</h2>
          <p>Algunas respuestas para acompañarte<br className={styles.desktopBreak} /> antes del encuentro.</p>
          <a className={styles.faqButton} href="#preguntas-frecuentes">Ver preguntas frecuentes <span aria-hidden="true">↓</span></a>
        </div>
      </section>
      <div className={styles.questions} id="preguntas-frecuentes">
        {questions.map(question => (
          <details key={question.title} className={styles.question}>
            <summary>{question.title}<span className={styles.plus} aria-hidden="true">+</span></summary>
            <p>{question.answer}</p>
          </details>
        ))}
      </div>
      <div className={styles.bottom}>
        <div className={styles.navigationRow}>
          <Link href="/" className={styles.brand} aria-label="Vamos al Santísimo, inicio">
            <Image src="/2026/logo.webp" alt="Vamos al Santísimo" width={132} height={98} sizes="132px" />
          </Link>
          <nav className={styles.links} aria-label="Navegación del pie de página">
            <Link href="/">Inicio</Link>
            <Link href="/encuentro#evento">Encuentro</Link>
            <Link href="/encuentro#taller">Taller</Link>
            <Link href="/encuentro#pablo">Pablo Martínez</Link>
          </nav>
          <a className={styles.contact} href={whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} strokeWidth={1.4} aria-hidden="true" /> Contacto <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.legal}><small>© 2026 Vamos al Santísimo</small><span>Fe, música y comunidad.</span></div>
      </div>
    </footer>
  )
}
