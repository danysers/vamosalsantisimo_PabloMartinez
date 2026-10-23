'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import styles from './propuestas.module.css'

const concepts = [
  { name: 'Noche dorada', idea: 'Negro, oro y una custodia protagonista.' },
  { name: 'Luz de altar', idea: 'Marfil cálido con la custodia como centro visual.' },
  { name: 'Vino y oro', idea: 'Un marco solemne en bordó profundo.' },
  { name: 'Azul contemplativo', idea: 'Azul noche y un resplandor sereno.' },
  { name: 'Editorial', idea: 'Tipografía amplia y composición clara.' },
  { name: 'Oliva', idea: 'Verde capilla con información del encuentro.' },
  { name: 'Arco clásico', idea: 'Arco litúrgico y tonos de pergamino.' },
  { name: 'Juntos', idea: 'La custodia y el retrato de Pablo en una misma escena.' },
  { name: 'Luz plena', idea: 'Fondo claro con una composición central.' },
  { name: 'Encuentro', idea: 'Panel moderno con fecha, lugar y horarios.' },
] as const

const themeClasses = [
  styles.noche,
  styles.marfil,
  styles.vino,
  styles.azul,
  styles.editorial,
  styles.oliva,
  styles.arco,
  styles.juntos,
  styles.luz,
  styles.encuentro,
]

type GalleryProps = {
  initialDesign: number
  exportMode: boolean
}

export default function ProposalGallery({ initialDesign, exportMode }: GalleryProps) {
  const [selected, setSelected] = useState(initialDesign)
  const concept = concepts[selected]

  function selectDesign(index: number) {
    setSelected(index)
    const url = new URL(window.location.href)
    url.searchParams.set('d', String(index + 1))
    window.history.replaceState(null, '', url)
  }

  return (
    <main className={`${styles.gallery} ${exportMode ? styles.export : ''}`}>
      {!exportMode && (
        <header className={styles.selectorBar}>
          <div className={styles.selectorIntro}>
            <p>VAMOS AL SANTÍSIMO</p>
            <h1>10 propuestas de portada</h1>
          </div>
          <nav className={styles.selector} aria-label="Elegir propuesta de portada">
            {concepts.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={selected === index ? styles.selected : ''}
                aria-pressed={selected === index}
                aria-label={`Propuesta ${index + 1}: ${item.name}`}
                onClick={() => selectDesign(index)}
              >
                {String(index + 1).padStart(2, '0')}
              </button>
            ))}
          </nav>
          <div className={styles.selectorCount}>{String(selected + 1).padStart(2, '0')} / 10</div>
        </header>
      )}

      <section className={`${styles.hero} ${themeClasses[selected]}`} aria-label={`Propuesta ${selected + 1}: ${concept.name}`}>
        <div className={styles.backdrop} aria-hidden="true" />
        <div className={styles.frame} aria-hidden="true" />

        <nav className={styles.siteNav} aria-label="Navegación de la página propuesta">
          <Link href="/" className={styles.brand} aria-label="Vamos al Santísimo, inicio">
            <Image src="/2026/logo.webp" alt="" width={166} height={78} unoptimized />
          </Link>
          <div className={styles.navLinks}>
            <Link href="/encuentro#evento">El encuentro</Link>
            <Link href="/encuentro#taller">Taller</Link>
            <Link href="/encuentro#pablo">Pablo Martínez</Link>
          </div>
        </nav>

        <div className={styles.halo} aria-hidden="true" />

        <div className={styles.art} aria-hidden="true">
          <Image
            className={styles.custodia}
            src="/2026/adoracion/custodia-original-transparente.png"
            alt=""
            width={461}
            height={948}
            unoptimized
            priority
          />
          {selected === 7 && (
            <Image
              className={styles.pablo}
              src="/2026/immersive/pablo.webp"
              alt=""
              width={1025}
              height={1535}
              unoptimized
              priority
            />
          )}
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>Una invitación a la adoración · 2026</p>
          <h2><span>Vamos al</span><em>Santísimo</em></h2>
          <p className={styles.subtitle}>Adoración con Pablo Martínez</p>
          <p className={styles.date}>Sábado 19 de diciembre de 2026</p>

          <div className={styles.facts}>
            <span>20:00 h</span>
            <i aria-hidden="true" />
            <span>María Auxiliadora</span>
            <i aria-hidden="true" />
            <span>Entrada gratuita</span>
          </div>

          <div className={styles.actions}>
            <Link className={styles.primary} href="/encuentro#evento">Ver el encuentro <span aria-hidden="true">↗</span></Link>
            <Link className={styles.secondary} href="/encuentro#taller">Taller de músicos</Link>
          </div>

        </div>

        <div className={styles.bottomMark} aria-hidden="true">
          <span>Fe</span><b>✳</b><span>Música</span><b>✳</b><span>Encuentro</span>
        </div>
      </section>

      {!exportMode && (
        <footer className={styles.galleryFooter}>
          <span>{concept.name}</span>
          <span>{concept.idea}</span>
          <div>
            <button type="button" onClick={() => selectDesign((selected + 9) % 10)} aria-label="Ver propuesta anterior">←</button>
            <button type="button" onClick={() => selectDesign((selected + 1) % 10)} aria-label="Ver propuesta siguiente">→</button>
          </div>
        </footer>
      )}
    </main>
  )
}
