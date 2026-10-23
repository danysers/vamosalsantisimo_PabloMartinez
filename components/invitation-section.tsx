import Image from 'next/image'
import { Heart, MapPin, Music2, UsersRound } from 'lucide-react'
import ShareInvitation from './share-invitation'
import styles from './invitation-section.module.css'

const values = [
  { title: 'Música', text: 'Un lenguaje para orar y encontrarnos.', Icon: Music2 },
  { title: 'Encuentro', text: 'Una noche de comunidad y adoración.', Icon: null },
  { title: 'Fe', text: 'Un espacio abierto para acercarse y compartir.', Icon: Heart },
]

export default function InvitationSection() {
  return (
    <section className={styles.section} id="invitacion" aria-labelledby="invitation-title">
      <div className={styles.atmosphere} aria-hidden="true">
        <svg viewBox="0 0 1600 1000" preserveAspectRatio="none">
          <g fill="none" stroke="#bda26d">
            <path d="M-200 950 C400 600 1000 180 1800 130" opacity=".23" strokeWidth="1" />
            <path d="M-200 975 C400 625 1000 205 1800 155" opacity=".12" strokeWidth=".7" />
            <path className={styles.glint} d="M-200 950 C400 600 1000 180 1800 130" pathLength="1000" strokeWidth="1.5" opacity=".45" />
          </g>
        </svg>
      </div>
      <div className={styles.content}>
        <header className={styles.heading}>
          <p>La invitación</p>
          <h2 id="invitation-title">Una experiencia para compartir</h2>
        </header>
        <div className={styles.values}>
          {values.map(({ title, text, Icon }) => (
            <div className={styles.value} key={title}>
              {Icon ? <Icon className={styles.icon} size={32} strokeWidth={1.3} aria-hidden="true" /> : <svg className={styles.icon} width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M16 2v28M6 11h20" /></svg>}
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className={styles.cards}>
          <article className={`${styles.card} ${styles.location}`} aria-labelledby="directions-title">
            <div className={styles.map} aria-hidden="true"><Image src="/2026/invitacion/mapa-dorado.png" alt="" fill sizes="(max-width: 700px) 86vw, 40vw" /></div>
            <div className={styles.cardCopy}>
              <MapPin className={styles.cardIcon} size={22} strokeWidth={1.3} aria-hidden="true" />
              <h3 id="directions-title">Cómo llegar</h3>
              <p>El lugar de la adoración está por confirmar. Compartiremos la dirección exacta y las indicaciones para llegar cuando estén confirmadas.</p>
            </div>
          </article>
          <article className={styles.card} aria-labelledby="invite-friend-title">
            <UsersRound className={styles.cardIcon} size={22} strokeWidth={1.3} aria-hidden="true" />
            <h3 id="invite-friend-title">Invitá a un amigo</h3>
            <p>La fe también se comparte. Invitá a alguien a vivir esta noche de música, encuentro y adoración.</p>
            <ShareInvitation />
          </article>
        </div>
      </div>
    </section>
  )
}
