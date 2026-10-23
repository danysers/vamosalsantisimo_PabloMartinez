'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import styles from './golden-hero.module.css'

function GoldDust({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, last = 0, elapsed = 0, width = 1, height = 1
    const particles = Array.from({ length: 85 }, (_, i) => ({
      x: ((i * 47 + 13) % 101) / 100, y: ((i * 37 + 7) % 101) / 100,
      radius: i % 13 === 0 ? 3.2 : .65 + (i % 4) * .36,
      speed: 4 + (i % 7) * 1.2, phase: i * 1.47,
    }))
    function paint(time: number) {
      if (!ctx || !element) return
      const moving = !paused && !reduce.matches && !document.hidden
      if (moving && last) elapsed += Math.min(time - last, 50) / 1000
      last = time
      ctx.clearRect(0, 0, width, height)
      for (const [index, p] of particles.entries()) {
        const side = index % 2 === 0 ? p.x * width * .13 : width * (.9 + p.x * .1)
        const x = side + Math.sin(elapsed * .14 + p.phase) * 12
        const y = ((p.y * height - elapsed * p.speed) % height + height) % height
        const alpha = .18 + (Math.sin(elapsed * .55 + p.phase) + 1) * .2
        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.radius * 4)
        glow.addColorStop(0, `rgba(255,219,145,${alpha})`)
        glow.addColorStop(.25, `rgba(230,166,63,${alpha * .7})`)
        glow.addColorStop(1, 'rgba(211,132,38,0)')
        ctx.fillStyle = glow
        ctx.beginPath(); ctx.arc(x, y, p.radius * 4, 0, Math.PI * 2); ctx.fill()
      }
      if (moving) frame = requestAnimationFrame(paint)
    }
    function restart() { cancelAnimationFrame(frame); last = 0; paint(performance.now()) }
    function resize() {
      if (!element || !ctx) return
      width = Math.max(1, element.clientWidth); height = Math.max(1, element.clientHeight)
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); restart()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    reduce.addEventListener('change', restart)
    document.addEventListener('visibilitychange', restart)
    resize()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      reduce.removeEventListener('change', restart)
      document.removeEventListener('visibilitychange', restart)
    }
  }, [paused])
  return <canvas ref={canvas} className={styles.dust} aria-hidden="true" />
}

export default function GoldenHero() {
  const [paused, setPaused] = useState(false)
  const paths = ['M 420 590 C 700 530 890 150 1480 130', 'M 430 600 C 740 540 1010 130 1480 142', 'M 570 590 C 900 260 1150 355 1480 630']
  return (
    <main className={`${styles.stage} ${paused ? styles.paused : ''}`}>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.halo} />
        <div className={styles.beams}><i /><i /><i /></div>
        <svg className={styles.ribbons} viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gold-ribbon"><stop stopColor="#ab601b" stopOpacity="0" /><stop offset=".35" stopColor="#c99140" stopOpacity=".55" /><stop offset=".8" stopColor="#ffde9a" /><stop offset="1" stopColor="#e9ad55" /></linearGradient>
            <filter id="gold-soft"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          <g className={styles.ribbonDrift} fill="none" stroke="url(#gold-ribbon)">
            {paths.map((path, i) => <g key={path}>
              <path d={path} strokeWidth="12" opacity=".23" filter="url(#gold-soft)" />
              <path d={path} strokeWidth={i === 0 ? '1.8' : '.85'} opacity=".8" />
              <path d={path} pathLength="1000" className={styles.glint} style={{ animationDelay: `${-i * 4}s` }} stroke="#ffeac1" strokeWidth="2.4" />
            </g>)}
          </g>
        </svg>
      </div>
      <div className={styles.portrait}>
        <Image src="/2026/immersive/pablo.webp" alt="Pablo Martínez" width={1025} height={1535} preload sizes="(max-width: 700px) 90vw, 55vw" />
      </div>
      <GoldDust paused={paused} />
      <section className={styles.copy} aria-labelledby="hero-title">
        <h1 id="hero-title"><span>Vamos al</span><strong>Santísimo</strong></h1>
        <div className={styles.rule} aria-hidden="true" />
        <p className={styles.subtitle}>Adoración con Pablo Martínez</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/encuentro#evento">Ver el encuentro <span aria-hidden="true">↗</span></Link>
          <Link className={styles.secondary} href="/encuentro#taller">Taller de músicos</Link>
          <a className={`${styles.secondary} ${styles.workshopPreview}`} href="/formacion">Por aquí, taller de músicos <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <button className={styles.motionControl} onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Reanudar animaciones' : 'Pausar animaciones'}>
        <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span><span>{paused ? 'Reanudar' : 'Pausar'} animación</span>
      </button>
    </main>
  )
}
