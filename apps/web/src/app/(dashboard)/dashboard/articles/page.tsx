import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DomainPicker } from '@/components/dashboard/domain-picker'
import { DomainSwitcher } from '@/components/dashboard/domain-switcher'
import { ArticlesFilters } from './articles-filters'
import { ArticlesTable } from './articles-table'
import { hasActiveFilter, parseArticleFilter, parseArticleSort } from './filters'

export const metadata = { title: 'Articles — cancerWeb' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export default async function ArticlesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const cookieHeader = (await cookies()).toString()
  const sdk = serverSdk(cookieHeader)

  const { data: domainsData } = await sdk.Domains({ page: { limit: 100, offset: 0 } })
  const domains = domainsData.domains.items

  if (domains.length === 0) {
    return (
      <EmptyState
        title="Aucun domaine éditorial"
        description="Créez un domaine avant de consulter ses articles."
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
    return <DomainPicker domains={domains} basePath="/dashboard/articles" />
  }

  const filter = parseArticleFilter(params)
  const sort = parseArticleSort(firstParam(params.sort))
  const page = Math.max(1, Number(firstParam(params.page)) || 1)
  const activeFilter = hasActiveFilter(filter)

  // Requête indépendante des filtres, pour distinguer « ce domaine n'a aucun
  // article » de « aucun résultat pour ces filtres » : la seconde ne doit pas
  // être confondue avec la première, elles appellent des actions différentes
  // (créer un article vs. effacer les filtres). Filtrage, tri et pagination
  // ont désormais lieu côté serveur (voir `article-query.ts`) : `data.articles.totalCount`
  // reflète le filtre appliqué, pas le total du domaine.
  const [{ data: totalData }, { data }, { data: categoriesData }] = await Promise.all([
    sdk.Articles({ domainId, page: { limit: 1, offset: 0 } }),
    sdk.Articles({
      domainId,
      filter: activeFilter ? filter : undefined,
      sort,
      page: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
    sdk.ArticleCategories({ domainId }),
  ])

  const hasAnyArticlesAtAll = totalData.articles.totalCount > 0
  const pageItems = data.articles.items

  // Le menu déroulant "Auteur" (voir `articles-filters.tsx`) tire ses options
  // du lot actuellement affiché — il n'existe aucune query GraphQL listant
  // les membres d'un domaine (voir la revue de ce correctif) : construire une
  // liste exhaustive nécessiterait une nouvelle query serveur, hors périmètre
  // ici. Limite assumée : un auteur absent de la page courante n'apparaît pas
  // dans le menu, même si le filtrer par son id (ex. lien partagé) fonctionne
  // toujours correctement côté serveur.
  const authors = Array.from(new Map(pageItems.map((article) => [article.author.id, article.author])).values())
  const categories = categoriesData.categories

  const emptyState = !hasAnyArticlesAtAll ? (
    <EmptyState
      title="Aucun article"
      description="Les articles sont rédigés à partir d’une idée sélectionnée. Rendez-vous dans Idées pour créer votre premier article."
      action={
        <Link href={`/dashboard/topics?domainId=${domainId}`}>
          <Button>Voir les idées</Button>
        </Link>
      }
    />
  ) : (
    <EmptyState
      title="Aucun résultat pour ces filtres"
      description="Aucun article ne correspond à cette combinaison de recherche et de filtres."
      action={
        <Link href={`/dashboard/articles?domainId=${domainId}`}>
          <Button variant="secondary">Effacer les filtres</Button>
        </Link>
      }
    />
  )

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Articles</h1>
        <DomainSwitcher domains={domains} currentDomainId={domainId} basePath="/dashboard/articles" />
      </div>

      {(hasAnyArticlesAtAll || activeFilter) && (
        <ArticlesFilters domainId={domainId} authors={authors} categories={categories} />
      )}

      <ArticlesTable
        articles={pageItems}
        totalCount={data.articles.totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        emptyState={emptyState}
      />
    </section>
  )
}
