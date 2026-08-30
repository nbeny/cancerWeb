'use client'

import { useRouter } from 'next/navigation'
import type { ChangeEvent } from 'react'

interface DomainOption {
  id: string
  name: string
}

interface Props {
  domains: DomainOption[]
  currentDomainId: string
  basePath: string
}

export function DomainSwitcher({ domains, currentDomainId, basePath }: Props) {
  const router = useRouter()

  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    // Changer de domaine repart d'une URL propre (`?domainId=...` seul) :
    // les filtres/tri/pagination en cours portent sur les données d'un autre
    // domaine et n'ont aucune raison de rester pertinents.
    router.push(`${basePath}?domainId=${event.target.value}`)
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="sr-only">Domaine éditorial</span>
      <select
        value={currentDomainId}
        onChange={onChange}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
      >
        {domains.map((domain) => (
          <option key={domain.id} value={domain.id}>
            {domain.name}
          </option>
        ))}
      </select>
    </label>
  )
}
