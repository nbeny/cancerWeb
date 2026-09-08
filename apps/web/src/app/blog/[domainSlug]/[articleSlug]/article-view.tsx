import type { PublicArticleFieldsFragment } from '@cancerweb/graphql'
import { normaliserTitresCorps } from './article-headings'

interface Props {
  article: PublicArticleFieldsFragment
}

// Même registre que `topics-table.tsx` : jour/mois/année en chiffres. Le blog
// public n'invente pas son propre format de date — deux formats français
// concurrents dans la même application se remarquent surtout le jour où l'un
// des deux est corrigé et pas l'autre.
const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Faute de `@tailwindcss/typography` dans ce projet (vérifié : ni dépendance,
// ni `@plugin` dans `globals.css` — les classes `prose` de
// `components/editor/preview.tsx` n'ont donc aujourd'hui aucun effet), le
// corps de l'article est habillé par variantes arbitraires. Elles s'appliquent
// aux balises produites par le rendu Markdown, qu'on ne peut pas décorer une à
// une : ce HTML est généré côté API, aucune classe ne peut y être posée depuis
// ici. Ajouter le greffon serait une modification de dépendances hors du
// périmètre de cette page.
const STYLE_CORPS = [
  '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-900',
  '[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900',
  '[&_p]:my-4 [&_p]:leading-7',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
  '[&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600',
  '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-slate-100',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  '[&_img]:my-4 [&_img]:rounded-md',
  '[&_table]:my-4 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:border-slate-200 [&_th]:py-2 [&_td]:border-b [&_td]:border-slate-100 [&_td]:py-2',
  '[&_hr]:my-8 [&_hr]:border-slate-200',
].join(' ')

/**
 * Corps de la page d'article public. Purement présentationnel : il ne lit ni
 * l'URL, ni le réseau, ni le cache — c'est ce qui permet de le monter tel quel
 * dans un test (voir `article-view.test.tsx`) et d'y couvrir les cas que les
 * champs facultatifs rendent possibles.
 *
 * Tous les champs nuls du fragment public le sont réellement en base (voir
 * `apps/api/prisma/schema.prisma`) : un article sans couverture, sans extrait
 * ou — pour des données reprises d'un import — sans HTML rendu doit s'afficher
 * sans faire tomber la page.
 */
export function ArticleView({ article }: Props) {
  return (
    <article>
      {/* `coverImageUrl` est une URL arbitraire saisie au back-office :
          `next/image` exigerait de déclarer chaque hôte distant dans
          `images.remotePatterns` (next.config.ts), c'est-à-dire de connaître à
          l'avance les hôtes des images d'un contenu éditorial. Une balise
          `<img>` accepte n'importe quelle source sans configuration ; la
          contrepartie (pas d'optimisation ni de dimensions connues) est
          assumée. */}
      {article.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImageUrl}
          // Couverture décorative : le titre juste en dessous porte déjà
          // l'information. Un `alt` vide la retire de la restitution vocale
          // plutôt que d'y faire lire une URL ou un texte inventé.
          alt=""
          className="mb-6 w-full rounded-lg object-cover"
        />
      )}

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{article.title}</h1>

      {/* `publishedAt` ne peut pas être nul en pratique — l'API ne renvoie que
          des articles dont la date de publication est passée (voir
          `publishedWhere` dans `apps/api/src/public/public.service.ts`) — mais
          le schéma GraphQL l'autorise. On omet la ligne plutôt que d'afficher
          « Invalid Date ». `dateTime` porte l'horodatage ISO brut : c'est la
          forme lisible par une machine, la version française n'existant que
          pour l'œil du lecteur. */}
      {article.publishedAt && (
        <p className="mt-3 text-sm text-slate-500">
          Publié le{' '}
          <time dateTime={article.publishedAt}>
            {FORMAT_DATE.format(new Date(article.publishedAt))}
          </time>
        </p>
      )}

      {/* `dangerouslySetInnerHTML` assumé : `renderedHtml` sort de
          `render()` (apps/api/src/markdown/render.ts), qui applique
          `rehype-sanitize` avant toute écriture en base. Aucune sanitation
          n'est refaite ici — la dupliquer côté web masquerait sa disparition
          éventuelle côté API, alors que c'est là-bas, et là-bas seulement, que
          la barrière doit tenir (mêmes raisons que
          `components/editor/preview.tsx`).

          `normaliserTitresCorps` n'entame en rien ce partage des rôles : elle
          ajuste un NIVEAU DE TITRE pour que la page n'ait qu'un seul `<h1>`,
          elle ne retire aucune balise active et n'offre aucune garantie
          d'innocuité. Voir sa jsdoc. */}
      {article.renderedHtml && (
        <div
          className={`mt-8 text-slate-800 ${STYLE_CORPS}`}
          dangerouslySetInnerHTML={{ __html: normaliserTitresCorps(article.renderedHtml) }}
        />
      )}
    </article>
  )
}
