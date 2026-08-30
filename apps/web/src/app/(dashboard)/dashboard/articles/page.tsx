import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { DomainPicker } from '@/components/dashboard/domain-picker'
import { DomainSwitcher } from '@/components/dashboard/domain-switcher'
import { ArticlesFilters } from './articles-filters'
import { ArticlesTable } from './articles-table'
import { matchesArticleFilters, paginate, parseArticleFilters, parseArticleSort, sortArticles } from './filters'

export const metadata = { title: 'Articles — cancerWeb' }

const PAGE_SIZE = 20

// L'API n'expose qu'un filtre `search` (plein texte) et aucun paramètre de
// tri sur `articles(...)` (voir le commentaire en tête de
// `packages/graphql/src/operations/articles.graphql`). On récupère donc un
// lot large en une requête — suffisant pour le volume attendu en Lot 1 — puis
// on applique statut/auteur/catégorie/score minimum/tri/pagination côté
// client dans ce composant serveur (pas de hook, juste des fonctions pures
// testées dans `filters.test.ts`). Au-delà de cette limite, filtrer devient
// incomplet : un vrai correctif nécessiterait d'étendre `ArticleFilter` et
// `articles(...)` côté API (hors périmètre de cette tâche, apps/api n'est pas
// modifié).
const FETCH_LIMIT = 500

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

  const search = firstParam(params.q)?.trim() || undefined
  const filters = parseArticleFilters(params)
  const sort = parseArticleSort(firstParam(params.sort))
  const page = Math.max(1, Number(firstParam(params.page)) || 1)

  // Requête indépendante des filtres, pour distinguer « ce domaine n'a aucun
  // article » de « aucun résultat pour ces filtres » : la seconde ne doit pas
  // être confondue avec la première, elles appellent des actions différentes
  // (créer un article vs. effacer les filtres).
  const [{ data: totalData }, { data }, { data: categoriesData }] = await Promise.all([
    sdk.Articles({ domainId, page: { limit: 1, offset: 0 } }),
    sdk.Articles({ domainId, filter: search ? { search } : undefined, page: { limit: FETCH_LIMIT, offset: 0 } }),
    sdk.ArticleCategories({ domainId }),
  ])

  const hasAnyArticlesAtAll = totalData.articles.totalCount > 0
  const fetchedArticles = data.articles.items
  const filtered = fetchedArticles.filter((article) => matchesArticleFilters(article, filters))
  const sorted = sortArticles(filtered, sort)
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = paginate(sorted, safePage, PAGE_SIZE)

  const authors = Array.from(new Map(fetchedArticles.map((article) => [article.author.id, article.author])).values())
  const categories = categoriesData.categories

  const hasActiveFilters = Boolean(search || filters.status || filters.authorId || filters.categoryId || filters.minScore != null)

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

      {(hasAnyArticlesAtAll || hasActiveFilters) && (
        <ArticlesFilters domainId={domainId} authors={authors} categories={categories} />
      )}

      <ArticlesTable
        articles={pageItems}
        totalCount={sorted.length}
        page={safePage}
        pageSize={PAGE_SIZE}
        emptyState={emptyState}
      />
    </section>
  )
}
