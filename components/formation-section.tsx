import Image from 'next/image'
import styles from './formation-section.module.css'

export default function FormationSection() {
  return (
    <section className={styles.section} id="formacion" aria-labelledby="formation-title">
      <div className={styles.scene}>
        <Image className={styles.forest} src="/2026/formacion/bosque-pablo-original.jpg" alt="Pablo Martínez con su guitarra, entre los árboles del bosque" fill sizes="100vw" quality={90} />
        <div className={styles.shade} aria-hidden="true" />
      </div>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.halo} />
        <svg className={styles.ribbons} viewBox="0 0 1600 1000" preserveAspectRatio="none">
          <defs>
            <linearGradient id="formation-gold"><stop stopColor="#a76b2a" stopOpacity="0" /><stop offset=".35" stopColor="#bd8c42" stopOpacity=".4" /><stop offset=".8" stopColor="#eec476" /><stop offset="1" stopColor="#d7a65c" /></linearGradient>
          </defs>
          <g fill="none" stroke="url(#formation-gold)">
            <path d="M200 820 C700 770 950 310 1660 190" strokeWidth="1.6" />
            <path d="M240 850 C740 800 1010 320 1660 210" strokeWidth=".8" opacity=".55" />
            <path d="M480 900 C1030 850 1220 480 1660 480" strokeWidth="1" opacity=".6" />
            <path className={styles.glint} d="M200 820 C700 770 950 310 1660 190" pathLength="1000" stroke="#ffe0a1" strokeWidth="2" />
          </g>
        </svg>
      </div>
      <div className={styles.content}>
        <h2 id="formation-title">Formación<span>católica</span></h2>
        <div className={styles.rule} aria-hidden="true" />
        <p className={styles.date}><time dateTime="2026-12-19T17:00:00-03:00">19 de diciembre · 17:00 h</time></p>
        <p className={styles.description}>Una tarde de formación católica para profundizar en la fe, la vida y la música como camino de encuentro con Dios.</p>
        <a className={styles.button} href="/formacion">Más información <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  )
}
