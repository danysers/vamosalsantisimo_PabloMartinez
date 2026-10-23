import { ArrowUpRight, HandHeart, UsersRound } from 'lucide-react'
import Link from 'next/link'
import styles from './community-support.module.css'

export default function CommunitySupportSection() {
  return <section className={styles.section} id="colabora" aria-labelledby="community-title">
    <div className={styles.content}>
      <header className={styles.sectionHeading}>
        <p className={styles.overline}>Hagámoslo posible juntos</p>
        <h2 id="community-title">Cada gesto de amor suma</h2>
      </header>
      <div className={styles.cardGrid}>
        <article className={styles.card}>
          <UsersRound className={styles.icon} size={30} strokeWidth={1.2} aria-hidden="true" />
          <h3>Sumate como voluntario</h3>
          <p>Regalá tu tiempo y tus ganas de servir. Nos acompañaremos antes, durante y después del encuentro, en comunidad.</p>
          <Link className={styles.primaryButton} href="/voluntarios">Quiero ser voluntario <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </article>
        <article className={styles.card}>
          <HandHeart className={styles.icon} size={30} strokeWidth={1.2} aria-hidden="true" />
          <h3>Colaborá con tu donación</h3>
          <p>Este encuentro requiere mucho trabajo y recursos. Tu aporte nos ayuda a cubrir los gastos y a preparar un lugar para todos.</p>
          <Link className={styles.outlineButton} href="/donaciones">Quiero colaborar <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </article>
      </div>
    </div>
  </section>
}
