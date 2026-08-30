import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DomainPicker } from '@/components/dashboard/domain-picker'
import { DomainSwitcher } from '@/components/dashboard/domain-switcher'
import { CategoryTree } from './category-tree'
import { TagManager } from './tag-manager'

export const metadata = { title: 'Catégories — cancerWeb' }

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

// Rôle minimum pour gérer la taxonomie (créer/modifier/supprimer une
// catégorie ou un tag) : EDITOR, exactement ce qu'exigent déjà
// `CategoriesResolver`/`TagsResolver` côté API (voir leur jsdoc — la
// taxonomie est une ressource partagée par tout le domaine, pas la
// propriété d'un auteur particulier). Un VIEWER/AUTHOR garde une vue en
// lecture seule : les actions restent visibles, désactivées avec leur
// raison, jamais masquées (même principe que la barre de transitions,
// correctif 2).
const CAN_MANAGE_ROLES = new Set(['EDITOR', 'OWNER'])

export default async function CategoriesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const cookieHeader = (await cookies()).toString()
  const sdk = serverSdk(cookieHeader)

  const { data: domainsData } = await sdk.Domains({ page: { limit: 100, offset: 0 } })
  const domains = domainsData.domains.items

  if (domains.length === 0) {
    return (
      <EmptyState
        title="Aucun domaine éditorial"
        description="Créez un domaine avant de gérer ses catégories et ses tags."
        action={
          <Link href="/dashboard/domains/new">
            <Button>Créer un domaine</Button>
          </Link>
        }
      />
    )
  }

  const domainId = firstParam(params.domainId)
  if (!domainId || !domains.some((domain) => domain.id === domainId)) {
    return <DomainPicker domains={domains} basePath="/dashboard/categories" />
  }

  const [{ data: domainData }, { data: categoriesData }, { data: tagsData }] = await Promise.all([
    sdk.DomainById({ id: domainId }),
    sdk.Categories({ domainId }),
    sdk.Tags({ domainId }),
  ])

  const canManage = CAN_MANAGE_ROLES.has(domainData.domain.myRole)

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Catégories et tags</h1>
        <DomainSwitcher domains={domains} currentDomainId={domainId} basePath="/dashboard/categories" />
      </div>

      <CategoryTree
        domainId={domainId}
        categories={categoriesData.categories}
        canManage={canManage}
        myRole={domainData.domain.myRole}
      />

      <TagManager domainId={domainId} tags={tagsData.tags} canManage={canManage} myRole={domainData.domain.myRole} />
    </section>
  )
}
