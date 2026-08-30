'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LABELS: Record<string, string> = {
  dashboard: 'Vue d’ensemble',
  domains: 'Domaines',
  topics: 'Idées',
  articles: 'Articles',
  new: 'Nouveau',
}

export function segmentsFromPathname(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

export function Breadcrumbs() {
  const segments = segmentsFromPathname(usePathname())

  return (
    <nav aria-label="Fil d’Ariane" className="px-6 py-3 text-sm text-slate-500">
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/')
        const isLast = index === segments.length - 1
        const label = LABELS[segment] ?? segment
        return (
          <span key={href}>
            {index > 0 && <span className="mx-2 text-slate-300">/</span>}
            {isLast ? (
              <span className="font-medium text-slate-900">{label}</span>
            ) : (
              <Link href={href} className="hover:text-slate-900">{label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
