import type { Metadata } from 'next'
import Image from 'next/image'
import SupportPageShell from '../../components/support-page-shell'
import DonationAccount from '../../components/donation-account'
import styles from '../../components/community-support.module.css'

export const metadata: Metadata = { title: 'Donaciones · Vamos al Santísimo | Pablo Martínez 2026' }

export default function DonationsPage() {
  return <SupportPageShell current="donaciones">
    <header className={styles.pageHeading}><p className={styles.overline}>Tu ayuda hace posible el encuentro</p><h1>Un pequeño aporte.<br />Un gran gesto de amor.</h1><p>Preparar este encuentro requiere mucho trabajo y recursos. Tu donación nos ayuda a cubrir los gastos de organización y a hacer posible esta noche de fe, música y comunidad.</p></header>
    <section className={styles.donationPanel} aria-label="Código QR y datos para colaborar">
      <div className={styles.qrPanel}>
        <h2 className={styles.qrHeading}>Pagá con cualquier billetera</h2>
        <Image src="/2026/donaciones/qr-billeteras.png" alt="QR interoperable de Vamos al Santísimo para colaborar con una billetera digital" width={696} height={796} unoptimized loading="eager" className={styles.qr} />
        <p>Escaneá el código con una billetera interoperable.</p>
      </div>
      <DonationAccount />
    </section>
    <p className={styles.gratitude}>Gracias por acompañarnos y ayudarnos a preparar el camino para que muchos corazones puedan encontrarse con Jesús.</p>
  </SupportPageShell>
}
