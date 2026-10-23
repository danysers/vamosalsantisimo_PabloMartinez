import Image from 'next/image'
import styles from './sponsors-section.module.css'

const sponsors = [
  { name: 'Alma Verde Paseo', file: 'alma-verde.png', light: true },
  { name: 'Cabildo Casual Bar', file: 'cabildo.png' },
  { name: 'Las Kalas Rental Suites', file: 'las-kalas.png' },
]

export default function SponsorsSection() {
  return (
    <section className={styles.section} id="marcas" aria-labelledby="sponsors-title">
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.halo} />
        <svg className={styles.ribbons} viewBox="0 0 2000 1100" preserveAspectRatio="none">
          <g fill="none" stroke="#bda26d">
            <path d="M-200 940 C380 510 1230 440 2180 170" opacity=".4" strokeWidth="1.5" />
            <path d="M-200 976 C380 546 1230 476 2180 206" opacity=".25" strokeWidth=".8" />
            <path className={styles.glint} d="M-200 940 C380 510 1230 440 2180 170" pathLength="1000" stroke="#ebc888" strokeWidth="1.6" />
          </g>
        </svg>
      </div>
      <div className={styles.content}>
        <header className={styles.heading}>
          <p>Vamos al Santísimo · 2026</p>
          <h2 id="sponsors-title">Marcas que nos acompañan<br />en este encuentro</h2>
          <span className={styles.rule} aria-hidden="true" />
        </header>
        <div className={styles.grid}>
          <ul className={styles.supporters} aria-label="Marcas que nos acompañan">
            {sponsors.map(sponsor => (
              <li key={sponsor.file} className={`${styles.card} ${sponsor.light ? styles.light : ''}`}>
                <Image src={`/2026/sponsors/${sponsor.file}`} alt={sponsor.name} width={240} height={160} sizes="(max-width: 600px) 28vw, 140px" />
              </li>
            ))}
          </ul>
          <div className={`${styles.card} ${styles.featured}`}>
            <Image src="/2026/sponsors/mila-blanco-sobre-negro.png" alt="Mila Club · Since 1994" width={866} height={219} sizes="(max-width: 600px) 75vw, 48vw" />
            <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
          </div>
        </div>
        <p className={styles.thanks}>Agradecemos a cada uno de ellos y que Dios siga multiplicando el 100x1.</p>
      </div>
    </section>
  )
}
