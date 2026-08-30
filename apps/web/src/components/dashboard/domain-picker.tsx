import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

interface DomainOption {
  id: string
  name: string
}

interface Props {
  domains: DomainOption[]
  basePath: string
}

// Les pages "Idées" et "Articles" sont scopées à un domaine (les mutations
// GraphQL prennent un `domainId` explicite). Ce domaine vit dans l'URL
// (`?domainId=...`) plutôt que dans une session ou un cookie : un lien copié
// reste ainsi correct après rechargement et reste partageable, cohérent avec
// le choix fait pour le tri/la pagination de DataTable. Ce composant purement
// serveur (aucun état, uniquement des <Link>) s'affiche quand l'URL ne porte
// pas de `domainId` valide.
export function DomainPicker({ domains, basePath }: Props) {
  return (
    <EmptyState
      title="Choisissez un domaine"
      description="Cette page dépend d’un domaine éditorial. Sélectionnez celui que vous voulez consulter — l’adresse copiée conservera votre choix."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {domains.map((domain) => (
            <Link key={domain.id} href={`${basePath}?domainId=${domain.id}`}>
              <Button variant="secondary">{domain.name}</Button>
            </Link>
          ))}
        </div>
      }
    />
  )
}
