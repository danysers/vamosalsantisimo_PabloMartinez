import Image from 'next/image'
import styles from './adoration-section.module.css'

export default function AdorationSection() {
  return (
    <section className={styles.section} id="adoracion" aria-labelledby="adoration-title">
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.halo} />
        <svg viewBox="0 0 1600 1000" preserveAspectRatio="none"><g fill="none" stroke="#c69a53">
          <path d="M-100 850 C450 850 860 320 1750 200" strokeWidth="1.2" opacity=".35" />
          <path d="M-100 875 C450 875 860 345 1750 225" strokeWidth=".7" opacity=".2" />
          <path className={styles.glint} d="M-100 850 C450 850 860 320 1750 200" pathLength="1000" strokeWidth="1.7" stroke="#ffe3ac" />
        </g></svg>
      </div>
      <div className={styles.portrait}><Image src="/2026/immersive/pablo.webp" alt="Pablo Martínez" width={1025} height={1535} sizes="(max-width: 700px) 90vw, 45vw" /></div>
      <div className={styles.content}>
        <p className={styles.overline}>Una noche para encontrarnos con Jesús</p>
        <h2 id="adoration-title">Adoración<span>eucarística</span></h2>
        <div className={styles.rule} aria-hidden="true" />
        <p className={styles.date}><time dateTime="2026-12-19T19:00:00-03:00">19 de diciembre · 19:00 h</time></p>
        <p className={styles.location}>Lugar a confirmar · Entrada gratuita</p>
        <p className={styles.description}>Una noche de oración, música y adoración a Jesús en el Santísimo Sacramento, junto a Pablo Martínez.</p>
      </div>
    </section>
  )
}
