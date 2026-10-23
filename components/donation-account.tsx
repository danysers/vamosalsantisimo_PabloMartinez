'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import { donationAccount } from '../lib/community-support'
import styles from './community-support.module.css'

export default function DonationAccount() {
  const [status, setStatus] = useState('')
  async function copyAlias() {
    try { await navigator.clipboard.writeText(donationAccount.alias); setStatus('Alias copiado.') }
    catch { setStatus('No se pudo copiar. Podés seleccionar el alias y copiarlo manualmente.') }
  }
  return <div className={styles.account}>
    <p className={styles.overline}>Detalle de cuenta</p>
    <h2>{donationAccount.platform}</h2>
    <dl><div><dt>Alias</dt><dd className={styles.alias}>{donationAccount.alias}</dd></div><div><dt>Titular</dt><dd>{donationAccount.holder}</dd></div><div><dt>DNI</dt><dd>{donationAccount.dni}</dd></div></dl>
    <button className={styles.outlineButton} onClick={copyAlias}><Copy size={16} aria-hidden="true" />Copiar alias</button>
    <p className={styles.status} role="status">{status}</p>
  </div>
}
