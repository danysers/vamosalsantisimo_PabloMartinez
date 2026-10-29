import type { ReactNode } from 'react'
import Link from 'next/link'
import { BadgeCheck, ClipboardList, CreditCard, LayoutDashboard, Settings2, UsersRound } from 'lucide-react'
import { SignOut } from './login-form'

export type AdminSection = 'overview' | 'registrations' | 'payments' | 'workshop'

const roleLabels = {
  configuration: 'Configuración',
  registration_operator: 'Inscripciones y pagos',
  admission_operator: 'Control de ingreso',
  unlinked: 'Sin rol operativo',
} as const

export default function AdminWorkspace({ children, title, description, section, role, canManageWorkshop }: {
  children: ReactNode
  title: string
  description: string
  section: AdminSection
  role: keyof typeof roleLabels
  canManageWorkshop: boolean
}) {
  const items = [
    { href: '/admin', label: 'Resumen', icon: LayoutDashboard, key: 'overview' },
    ...(role !== 'unlinked' ? [
      { href: '/admin/inscripciones', label: 'Inscripciones', icon: ClipboardList, key: 'registrations' },
      { href: '/admin/acreditacion', label: 'Pagos y acreditación', icon: CreditCard, key: 'payments' },
    ] : []),
    ...(canManageWorkshop ? [{ href: '/admin/taller', label: 'Precios y grupos', icon: Settings2, key: 'workshop' }] : []),
  ] as const

  return <div className="admin-workspace">
    <header className="admin-topbar">
      <Link className="admin-topbar-brand" href="/admin" aria-label="Ir al resumen del panel">
        <span className="admin-monogram" aria-hidden="true">VAS</span>
        <span><strong>Vamos al Santísimo</strong><small>Panel del taller · 2026</small></span>
      </Link>
      <div className="admin-topbar-account"><span className="admin-role-pill"><BadgeCheck size={15} aria-hidden="true" /> {roleLabels[role]}</span><SignOut /></div>
    </header>
    <div className="admin-workspace-body">
      <aside className="admin-sidebar" aria-label="Secciones del panel">
        <p className="admin-sidebar-label">Operación</p>
        <nav className="admin-sidebar-links" aria-label="Navegación administrativa">
          {items.map(item => <Link key={item.key} href={item.href} aria-current={section === item.key ? 'page' : undefined}>
            <item.icon size={18} aria-hidden="true" /><span>{item.label}</span>
          </Link>)}
        </nav>
        <div className="admin-sidebar-note"><UsersRound size={19} aria-hidden="true" /><p>Los cambios de pagos, excepciones e ingresos quedan asociados al operador y registrados en la base.</p></div>
      </aside>
      <main className="admin-main" id="contenido">
        <p className="admin-breadcrumb"><Link href="/admin">Panel</Link><span aria-hidden="true">/</span>{title}</p>
        <div className="admin-page-heading"><div><p className="admin-kicker">Taller de músicos · 19 de diciembre de 2026</p><h1>{title}</h1><p>{description}</p></div></div>
        {children}
      </main>
    </div>
  </div>
}
