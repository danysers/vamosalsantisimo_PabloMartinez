import type { Metadata } from 'next'
import ProposalGallery from './proposal-gallery'

export const metadata: Metadata = {
  title: 'Propuestas de portada · Vamos al Santísimo',
  description: 'Diez propuestas visuales para la página principal de Vamos al Santísimo.',
  robots: { index: false, follow: false },
}

type PageProps = {
  searchParams: Promise<{ d?: string; export?: string }>
}

export default async function PropuestasInicio({ searchParams }: PageProps) {
  const params = await searchParams
  const requested = Number(params.d ?? '1')
  const initialDesign = Number.isInteger(requested) && requested >= 1 && requested <= 10 ? requested - 1 : 0

  return <ProposalGallery initialDesign={initialDesign} exportMode={params.export === '1'} />
}
