'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FileText, FolderTree, Globe, LayoutDashboard, Lightbulb, Settings, Sparkles, Library } from 'lucide-react'
import { cn } from '@/lib/cn'

// Les entrées non encore construites restent visibles mais désactivées :
// l'utilisateur voit où va le produit sans tomber sur des 404. `scoped`
// distingue les pages qui dépendent d'un domaine (`?domainId=...`, voir
// `DomainSwitcher`/`DomainPicker`) des pages qui n'en dépendent pas
// (`/dashboard`, `/dashboard/domains`) — sans `domainId` dans le lien, une
// page scopée renvoie systématiquement au sélecteur de domaine, même quand
// un domaine est déjà sélectionné ailleurs dans l'app.
const NAV = [
  { href: '/dashboard', label: 'Vue d’ensemble', icon: LayoutDashboard, enabled: true, scoped: false },
  { href: '/dashboard/domains', label: 'Domaines', icon: Globe, enabled: true, scoped: false },
  { href: '/dashboard/topics', label: 'Idées', icon: Lightbulb, enabled: true, scoped: true },
  { href: '/dashboard/articles', label: 'Articles', icon: FileText, enabled: true, scoped: true },
  { href: '/dashboard/categories', label: 'Catégories', icon: FolderTree, enabled: true, scoped: true },
  { href: '/dashboard/ai', label: 'Jobs IA', icon: Sparkles, enabled: true, scoped: true },
  { href: '/dashboard/sources', label: 'Sources', icon: Library, enabled: false, scoped: true },
  { href: '/dashboard/settings', label: 'Paramètres', icon: Settings, enabled: false, scoped: false },
] as const

export function Sidebar() {
  const pathname = usePathname()
  // Le domaine courant vit dans l'URL (`?domainId=...`, même convention que
  // partout ailleurs dans le dashboard) — jamais dans une session. La
  // sidebar le lit ici pour le reporter sur ses propres liens `scoped`.
  const domainId = useSearchParams().get('domainId')

  return (
    <nav aria-label="Navigation principale" className="flex h-full w-60 flex-col gap-1 border-r border-slate-200 bg-white p-3">
      <span className="px-3 py-4 text-lg font-semibold tracking-tight text-slate-900">cancerWeb</span>
      {NAV.map(({ href, label, icon: Icon, enabled, scoped }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
        const target = scoped && domainId ? `${href}?domainId=${domainId}` : href
        const classes = cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
          active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
          !enabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )
        return enabled ? (
          <Link key={href} href={target} className={classes} aria-current={active ? 'page' : undefined}>
            <Icon className="h-4 w-4" aria-hidden />{label}
          </Link>
        ) : (
          <span key={href} className={classes} title="Disponible dans un prochain lot">
            <Icon className="h-4 w-4" aria-hidden />{label}
          </span>
        )
      })}
    </nav>
  )
}
