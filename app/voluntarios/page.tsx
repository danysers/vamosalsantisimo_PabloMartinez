import type { Metadata } from 'next'
import { ArrowUpRight, Heart, Megaphone, UsersRound } from 'lucide-react'
import SupportPageShell from '../../components/support-page-shell'
import { volunteerGroupUrl } from '../../lib/community-support'
import styles from '../../components/community-support.module.css'

export const metadata: Metadata = { title: 'Equipo de voluntarios · Pablo Martínez 2026 | Vamos al Santísimo' }

export default function VolunteersPage() {
  return <SupportPageShell current="voluntarios">
    <header className={styles.pageHeading}><p className={styles.overline}>Equipo de voluntarios · Pablo Martínez 2026</p><h1>Tu tiempo también<br />es un regalo.</h1><p>Gracias por sumarte y por tus ganas de colaborar. Cada pequeña ayuda será muy importante para hacer posible este hermoso encuentro.</p></header>
    <div className={styles.volunteerIntro}><p>Nuestra misión será acompañar <strong>antes, durante y después del evento</strong>, colaborando en distintas tareas de organización y servicio.</p></div>
    <div className={styles.volunteerGrid}>
      <article className={styles.detailCard}><UsersRound className={styles.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h2>Nos organizamos en comunidad</h2><p>Creamos el grupo con anticipación para preparar todo con tiempo. Por ahora escribirán los administradores para evitar tantas notificaciones; iremos compartiendo información concreta cuando sea necesario.</p><p>Tendremos reuniones previas de formación y organización, con coordinadores que acompañarán a cada equipo. También habilitaremos el grupo para consultas y dudas.</p></article>
      <article className={styles.detailCard}><Megaphone className={styles.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h2>Desde ahora podés ayudar</h2><p>Compartí nuestras publicaciones en redes sociales para llegar a más personas. También podés invitar al grupo a quienes tengan ganas de colaborar.</p><p>Todo servicio, por pequeño que parezca, nos ayuda a preparar este encuentro.</p></article>
      <article className={`${styles.detailCard} ${styles.prayer}`}><Heart className={styles.icon} size={28} strokeWidth={1.2} aria-hidden="true" /><h2>Preparar el corazón</h2><p>También pedimos sus oraciones y, si lo desean, ofrecer pequeños sacrificios y mortificaciones por los frutos espirituales de este encuentro.</p><blockquote>Queremos preparar el camino para que muchos corazones puedan encontrarse con Jesús.</blockquote></article>
    </div>
    <section className={styles.join} aria-labelledby="join-title"><p className={styles.overline}>Demos juntos el primer paso</p><h2 id="join-title">¡Bienvenido al equipo!</h2><p>Para inscribirte como voluntario, sumate al grupo de WhatsApp. Allí los coordinadores compartirán las reuniones, las tareas y los próximos pasos.</p><a className={styles.primaryButton} href={volunteerGroupUrl} target="_blank" rel="noopener noreferrer">Inscribirme en el grupo de voluntarios <ArrowUpRight size={18} aria-hidden="true" /></a><p className={styles.small}>Gracias por regalar tu tiempo y tus ganas de servir. Que también sea una hermosa experiencia de comunidad para todos.</p></section>
  </SupportPageShell>
}
