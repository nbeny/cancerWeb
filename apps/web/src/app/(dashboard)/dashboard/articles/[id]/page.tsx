import Link from 'next/link'
import { cookies } from 'next/headers'
import { serverSdk } from '@/lib/graphql-client'
import { graphqlErrorCode } from '@/lib/graphql-error'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { ArticleEditor } from '@/components/editor/article-editor'

export const metadata = { title: 'Éditeur d’article — cancerWeb' }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ domainId?: string }>
}

export default async function ArticleEditorPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { domainId } = await searchParams

  // Même convention que `/dashboard/articles` et `/dashboard/topics/new` : le
  // domaine courant vit dans l'URL, jamais dans une session. Un lien vers cet
  // article sans `domainId` (ex. un ancien lien copié) ne peut pas deviner le
  // domaine réel de l'article sans l'avoir d'abord chargé — on demande donc
  // explicitement de repartir de la liste plutôt que de risquer d'interroger
  // le mauvais domaine.
  if (!domainId) {
    return (
      <ErrorState
        title="Domaine manquant"
        message="Ouvrez cet article depuis la liste des articles pour conserver le contexte du domaine."
        action={
          <Link href="/dashboard/articles">
            <Button variant="secondary">Retour aux articles</Button>
          </Link>
        }
      />
    )
  }

  const cookieHeader = (await cookies()).toString()
  const sdk = serverSdk(cookieHeader)

  let article
  try {
    const { data } = await sdk.Article({ domainId, id })
    article = data.article
  } catch (error) {
    if (graphqlErrorCode(error) === 'NOT_FOUND') {
      return (
        <ErrorState
          title="Article introuvable"
          message="Cet article n’existe pas dans ce domaine, ou vous n’y avez pas accès."
          action={
            <Link href={`/dashboard/articles?domainId=${domainId}`}>
              <Button variant="secondary">Retour aux articles</Button>
            </Link>
          }
        />
      )
    }
    // Toute autre panne (service indisponible, timeout...) remonte à
    // `error.tsx` : ce n'est pas une absence de contenu, ne pas la déguiser en une.
    throw error
  }

  const [{ data: categoriesData }, { data: tagsData }, { data: seoReportsData }] = await Promise.all([
    sdk.ArticleCategories({ domainId }),
    sdk.ArticleTags({ domainId }),
    sdk.SeoReports({ domainId, articleId: id, page: { limit: 1, offset: 0 } }),
  ])

  // Le plus récent est en tête (`seoReports` trie par `computedAt` décroissant,
  // voir `apps/api/src/seo/seo.service.ts`) — un tableau vide, jamais `null`,
  // distingue « jamais analysé » d'un score de 0 (voir `SeoPanel`).
  const initialSeoReport = seoReportsData.seoReports.items[0] ?? null

  return (
    <ArticleEditor
      domainId={domainId}
      article={article}
      categories={categoriesData.categories}
      allTags={tagsData.tags}
      initialSeoReport={initialSeoReport}
    />
  )
}
