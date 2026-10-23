'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { GoldDust } from './golden-hero'
import styles from './community-support.module.css'

export default function SupportPageShell({ children, current }: { children: ReactNode; current: 'voluntarios' | 'donaciones' }) {
  const [paused, setPaused] = useState(false)
  return <div className={`${styles.shell} ${paused ? styles.paused : ''}`}>
    <GoldDust paused={paused} />
    <div className={styles.pageAtmosphere} aria-hidden="true">
      <svg viewBox="0 0 1600 1200" preserveAspectRatio="none"><g fill="none" stroke="#c69a53">
        <path d="M-100 900 C350 700 1000 180 1750 110" opacity=".3" strokeWidth="1.2" />
        <path d="M-100 930 C350 730 1000 210 1750 140" opacity=".15" strokeWidth=".8" />
        <path className={styles.glint} d="M-100 900 C350 700 1000 180 1750 110" pathLength="1000" opacity=".5" strokeWidth="1.7" />
      </g></svg>
    </div>
    <header className={styles.pageHeader}>
      <Link href="/" aria-label="Vamos al Santísimo, inicio"><Image src="/2026/logo.webp" alt="Vamos al Santísimo" width={110} height={82} sizes="100px" /></Link>
      <nav aria-label="Navegación principal">
        <Link href="/">Inicio</Link><Link href="/voluntarios" aria-current={current === 'voluntarios' ? 'page' : undefined}>Voluntarios</Link><Link href="/donaciones" aria-current={current === 'donaciones' ? 'page' : undefined}>Donaciones</Link>
      </nav>
    </header>
    <main className={styles.pageMain}><Link className={styles.back} href="/#colabora"><ArrowLeft size={16} aria-hidden="true" />Volver al encuentro</Link>{children}</main>
    <footer className={styles.pageFooter}><span>Comunidad Vamos al Santísimo</span><span>Fe, música y comunidad.</span></footer>
    <button className={styles.motionControl} onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Reanudar animaciones' : 'Pausar animaciones'}>{paused ? '▷ Reanudar' : 'Ⅱ Pausar'} animación</button>
  </div>
}
