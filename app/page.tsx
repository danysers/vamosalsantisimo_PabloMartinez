import GoldenHero from '../components/golden-hero'
import SiteFooter from '../components/site-footer'
import SponsorsSection from '../components/sponsors-section'
import FormationSection from '../components/formation-section'
import InvitationSection from '../components/invitation-section'
import AdorationSection from '../components/adoration-section'
import CommunitySupportSection from '../components/community-support-section'

export default function Home() {
  return <GoldenHero><AdorationSection /><FormationSection /><InvitationSection /><CommunitySupportSection /><SponsorsSection /><SiteFooter /></GoldenHero>
}
