# Blog public B1 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque domaine éditorial expose un blog public sur son sous-domaine — accueil paginé et page d'article — sans jamais laisser fuiter un contenu non publié.

**Architecture:** Le `proxy.ts` de Next résout le sous-domaine en `Domain.slug` et réécrit vers un arbre de routes publiques. Un module NestJS dédié expose des résolveurs `@Public()` et des types GraphQL **séparés** de ceux du back-office, filtrant en dur sur `PUBLISHED` et `publishedAt <= maintenant`. Les pages sont statiques et régénérées à la demande via un webhook protégé par `REVALIDATE_SECRET`.

**Tech Stack:** NestJS 11 (GraphQL code-first), Prisma, Next.js 16 (App Router, `proxy.ts`), Jest, Vitest, Docker Compose.

**Spec :** `docs/superpowers/specs/2026-09-08-blog-public-design.md`

---

## Contraintes établies par expérience — ne pas les re-litiger

- Le bloc `:3000` de Caddy accepte déjà n'importe quel `Host` (vérifié : `cybersecurite.localhost:3000` et un hôte inconnu atteignent tous deux l'app). **Aucune modification de Caddy.**
- `*.localhost` résout nativement en 127.0.0.1.
- Next 16 : le middleware s'appelle `apps/web/src/proxy.ts` et exporte `proxy`. `middleware.ts` est déprécié — **ne pas en créer un**.
- Le `proxy.ts` actuel a `config.matcher = ['/dashboard/:path*']` et gère le rafraîchissement des cookies d'authentification. Élargir le matcher sans préserver ce comportement casserait la connexion au back-office.
- `GqlAuthGuard` est un `APP_GUARD` global ; `@Public()` (voir `apps/api/src/auth/auth.resolver.ts`) est le seul mécanisme d'exemption.
- `Article.renderedHtml` est précalculé à l'écriture : la page publique n'a aucun Markdown à convertir.
- `transitionArticle` (`apps/api/src/articles/articles.service.ts:218`) est l'entonnoir unique des changements de statut — donc le seul point d'accroche de la revalidation.
- La suite unitaire API se lance avec `npx jest --runInBand` (le mode parallèle épuise la mémoire, exit 137). `ts-jest` ne type-checke que les fichiers importés par un spec : **`npx tsc --noEmit` est un contrôle distinct et obligatoire**.
- Le SDL `packages/graphql/schema.graphql` n'est écrit qu'au bootstrap hors production ; le conteneur `api` tourne en production et ne l'écrit jamais. Pour le régénérer : booter l'app localement (`NestFactory.create` + `app.init()` + `app.close()`, sans `listen()`), puis `pnpm codegen` à la racine.

---

## Structure des fichiers

**Créés**
- `apps/web/src/lib/subdomain.ts` — extraction du slug de domaine depuis un `Host`. Fonction pure, aucune dépendance Next.
- `apps/web/src/lib/subdomain.spec.ts`
- `apps/web/src/app/blog/[domainSlug]/layout.tsx` — coquille du blog (en-tête, pied de page).
- `apps/web/src/app/blog/[domainSlug]/page.tsx` — accueil paginé.
- `apps/web/src/app/blog/[domainSlug]/[articleSlug]/page.tsx` — page d'article.
- `apps/web/src/app/api/revalidate/route.ts` — webhook de revalidation.
- `apps/api/src/public/public.types.ts`, `public.service.ts`, `public.resolver.ts`, `public.module.ts`
- `apps/api/src/public/public.service.spec.ts`
- `apps/api/test/public-blog.int-spec.ts` — les tests d'absence, garantie principale du lot.
- `packages/graphql/src/operations/public.graphql`

**Modifiés**
- `apps/web/src/proxy.ts` — résolution du sous-domaine + réécriture.
- `apps/api/src/app.module.ts` — enregistrement de `PublicModule`.
- `apps/api/src/articles/articles.service.ts` — déclenchement de la revalidation.
- `.env`, `.env.example` — `PUBLIC_ROOT_HOST`, `WEB_INTERNAL_URL`.
- `packages/graphql/schema.graphql`, `packages/graphql/src/generated.ts` — régénérés.

---

### Task 1 : Extraire le slug de domaine depuis l'en-tête `Host`

**Files:**
- Create: `apps/web/src/lib/subdomain.ts`
- Test: `apps/web/src/lib/subdomain.spec.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `apps/web/src/lib/subdomain.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { domainSlugFromHost } from './subdomain'

describe('domainSlugFromHost', () => {
  const root = 'localhost'

  it.each([
    ['cybersecurite.localhost', 'cybersecurite'],
    ['cybersecurite.localhost:3000', 'cybersecurite'],
    ['Cybersecurite.LOCALHOST:3000', 'cybersecurite'],
  ])('extrait le slug de %s', (host, expected) => {
    expect(domainSlugFromHost(host, root)).toBe(expected)
  })

  it.each([
    ['localhost', "l'hôte nu sert le back-office"],
    ['localhost:3000', "l'hôte nu avec port sert le back-office"],
    ['127.0.0.1:3000', 'une IP ne porte aucun sous-domaine'],
    ['exemple.com', "un hôte hors du domaine racine n'est pas reconnu"],
    ['', 'un en-tête Host vide'],
  ])('renvoie null pour %s (%s)', (host) => {
    expect(domainSlugFromHost(host, root)).toBeNull()
  })

  it('renvoie null quand Host est absent', () => {
    expect(domainSlugFromHost(null, root)).toBeNull()
  })

  it('ne retient que le premier label sur un sous-domaine imbriqué', () => {
    expect(domainSlugFromHost('a.b.localhost', root)).toBeNull()
  })

  it('fonctionne avec un domaine racine de production', () => {
    expect(domainSlugFromHost('cybersecurite.exemple.com', 'exemple.com')).toBe('cybersecurite')
    expect(domainSlugFromHost('exemple.com', 'exemple.com')).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `cd apps/web && npx vitest run src/lib/subdomain.spec.ts`
Expected: FAIL — `Cannot find module './subdomain'`.

- [ ] **Step 3 : Implémenter**

Créer `apps/web/src/lib/subdomain.ts` :

```ts
/**
 * Traduit un en-tête `Host` en `Domain.slug`, ou `null` quand la requête vise
 * le back-office plutôt qu'un blog.
 *
 * La règle est volontairement stricte — exactement UN label devant le domaine
 * racine — plutôt que « tout ce qui précède le dernier point ». Un slug est
 * une clé de recherche en base : accepter `a.b.localhost` reviendrait à
 * chercher un domaine nommé `a` sur une requête qui ne le désignait pas, ou
 * pire, à faire dépendre le blog servi d'un préfixe que n'importe qui peut
 * fabriquer. Ce qui n'est pas explicitement reconnu retombe sur le
 * back-office, jamais sur un blog choisi par défaut.
 *
 * `rootHost` est injecté plutôt que lu depuis l'environnement ici : cette
 * fonction reste pure et testable, l'appelant (`proxy.ts`) porte la
 * configuration.
 */
export function domainSlugFromHost(host: string | null | undefined, rootHost: string): string | null {
  if (!host) return null

  // `Host` peut porter le port ; la comparaison se fait sur le seul nom.
  const hostname = host.split(':')[0]?.toLowerCase().trim()
  if (!hostname) return null

  const root = rootHost.split(':')[0]?.toLowerCase().trim()
  if (!root || hostname === root) return null

  const suffix = `.${root}`
  if (!hostname.endsWith(suffix)) return null

  const slug = hostname.slice(0, -suffix.length)
  // Un seul label : `a.b.localhost` n'est pas un blog (voir la jsdoc).
  if (!slug || slug.includes('.')) return null

  return slug
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `cd apps/web && npx vitest run src/lib/subdomain.spec.ts`
Expected: PASS

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/lib/subdomain.ts apps/web/src/lib/subdomain.spec.ts
git commit -m "feat(web): extraire le slug de domaine depuis l'en-tete Host"
```

---

### Task 2 : Router les sous-domaines vers l'arbre public

**Files:**
- Modify: `apps/web/src/proxy.ts`
- Create: `apps/web/src/app/blog/[domainSlug]/layout.tsx`
- Modify: `.env`, `.env.example`

- [ ] **Step 1 : Déclarer le domaine racine**

Dans `.env` **et** `.env.example`, sous le bloc `# --- Web ---` :

```
# Hôte servant le back-office. Tout sous-domaine d'un cran en dessous est
# traité comme le slug d'un domaine éditorial et sert son blog public
# (voir apps/web/src/lib/subdomain.ts).
PUBLIC_ROOT_HOST=localhost
```

Puis exposer la variable au conteneur `web` dans `docker-compose.yml`, à côté de `API_INTERNAL_URL` — ce service n'a délibérément pas d'`env_file`, chaque variable y est listée explicitement (voir le commentaire du service) :

```yaml
      PUBLIC_ROOT_HOST: localhost
```

- [ ] **Step 2 : Étendre le proxy**

Remplacer `apps/web/src/proxy.ts` :

```ts
import { NextRequest, NextResponse } from 'next/server'
import { domainSlugFromHost } from './lib/subdomain'

// Next.js 16 a renommé le fichier `middleware.ts` en `proxy.ts` (export nommé `proxy`) ;
// `middleware.ts` est marqué déprécié dans node_modules/next/dist/docs — voir
// 01-app/03-api-reference/03-file-conventions/proxy.md, section "Migration to Proxy".
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl

  // Un sous-domaine désigne un blog public : la requête est RÉÉCRITE (l'URL
  // affichée ne change pas) vers l'arbre `/blog/<slug>`, que personne ne
  // visite directement. Cette branche passe avant toute logique
  // d'authentification : un blog est lisible sans compte, et la racine
  // redirige sinon vers le tableau de bord (voir app/page.tsx), ce qui
  // enverrait un lecteur sur le back-office.
  const slug = domainSlugFromHost(request.headers.get('host'), process.env.PUBLIC_ROOT_HOST ?? 'localhost')
  if (slug) {
    const url = request.nextUrl.clone()
    url.pathname = `/blog/${slug}${pathname === '/' ? '' : pathname}`
    return NextResponse.rewrite(url)
  }

  // Hôte nu : back-office. Comportement inchangé, mais le matcher couvre
  // désormais toutes les routes, donc la garde ne doit s'appliquer qu'au
  // tableau de bord.
  if (!pathname.startsWith('/dashboard')) return NextResponse.next()

  const hasAccess = request.cookies.has('access')
  const hasRefresh = request.cookies.has('refresh')

  if (hasAccess) return NextResponse.next()

  // Access expiré mais refresh présent : tenter une rotation avant de renvoyer au login.
  if (hasRefresh) {
    const url = new URL('/api/auth/refresh', request.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }

  const login = new URL('/auth/login', request.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

// Élargi de `/dashboard/:path*` à tout, sauf les fichiers internes de Next,
// les routes d'API et les fichiers statiques : la résolution du sous-domaine
// doit voir la racine `/` et chaque page du blog, pas seulement le
// back-office.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 3 : Créer la coquille du blog**

Créer `apps/web/src/app/blog/[domainSlug]/layout.tsx`. Il doit rendre un en-tête portant le nom du domaine (à récupérer via l'API publique, Task 3 — en attendant, un simple `{children}` suffit pour que la route existe et que Task 2 soit vérifiable). Écris-le d'abord minimal, il sera enrichi en Task 5.

```tsx
import type { ReactNode } from 'react'

/**
 * Coquille des pages publiques. Personne ne visite `/blog/<slug>`
 * directement : `proxy.ts` y réécrit les requêtes portant un sous-domaine.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
}
```

- [ ] **Step 4 : Vérifier le routage réellement**

Crée temporairement `apps/web/src/app/blog/[domainSlug]/page.tsx` renvoyant le slug, reconstruis et redémarre le service `web`, puis :

```bash
curl -s -o /dev/null -w "sous-domaine -> %{http_code}\n" -H "Host: cybersecurite.localhost:3000" http://localhost:3000/
curl -s -o /dev/null -w "hote nu      -> %{http_code}\n" http://localhost:3000/dashboard
```

Expected: le sous-domaine renvoie 200 (et non 307 vers `/dashboard`) ; l'hôte nu sur `/dashboard` conserve son comportement d'authentification (307 vers `/auth/login` sans cookie). Garde cette page provisoire, Task 5 la remplace.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/proxy.ts apps/web/src/app/blog .env.example docker-compose.yml
git commit -m "feat(web): router les sous-domaines vers le blog public"
```

---

### Task 3 : Module GraphQL public

**Files:**
- Create: `apps/api/src/public/public.types.ts`, `public.service.ts`, `public.resolver.ts`, `public.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/public-blog.int-spec.ts`

C'est la tâche la plus sensible du lot. Les tests vérifient une **absence** : qu'un contenu non publié ne sort jamais. Écris-les d'abord, et sois exhaustif.

- [ ] **Step 1 : Écrire les tests d'intégration qui échouent**

Créer `apps/api/test/public-blog.int-spec.ts`. Suis le pattern du harness existant (`apps/api/test/app-harness.ts`, et par exemple `articles.int-spec.ts`) pour créer utilisateur, domaine et articles. Les requêtes publiques doivent être envoyées **sans aucun cookie** — c'est le cœur du test.

Couvre au minimum :

```
- publicArticles renvoie un article PUBLISHED du domaine
- publicArticles n'inclut JAMAIS un article DRAFT
- publicArticles n'inclut JAMAIS un article REVIEW, APPROVED ni ARCHIVED
- publicArticles n'inclut JAMAIS un article SCHEDULED dont publishedAt est dans le futur
- publicArticles n'inclut JAMAIS un article publié d'un AUTRE domaine
- publicArticle renvoie NOT_FOUND pour le slug d'un article non publié
- publicArticle renvoie NOT_FOUND pour un slug d'un autre domaine
- publicDomain renvoie NOT_FOUND pour un slug de domaine inexistant
- publicDomain renvoie NOT_FOUND pour un domaine sans aucun article publié
- le type PublicArticle n'expose PAS rationale (introspection, ou requête demandant le champ -> erreur de validation)
```

Le dernier point mérite un mot : il ne se teste pas en lisant une valeur mais en constatant que le champ n'existe pas dans le schéma. Une requête GraphQL demandant `rationale` sur `PublicArticle` doit échouer en validation (`GRAPHQL_VALIDATION_FAILED`). C'est cette assertion qui empêche qu'on rebranche un jour le type interne sans s'en apercevoir.

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `cd apps/api && pnpm test:int -- public-blog`
Expected: FAIL — les requêtes `publicArticles` / `publicArticle` / `publicDomain` n'existent pas.

- [ ] **Step 3 : Implémenter les types publics**

Créer `apps/api/src/public/public.types.ts`. Types `@ObjectType()` **dédiés**, ne réutilisant NI `Article` NI `Topic` du back-office :

```ts
import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Paginated } from '../common/dto/page.input'

/**
 * Vue publique d'un article. Type SÉPARÉ de `Article` (articles/article.types.ts)
 * par sécurité, pas par confort : le type interne porte des champs qui ne
 * doivent jamais sortir — `rationale` (justification éditoriale interne,
 * Lot A), `authorId`, `topicId`, `latestSeoScore`, `scheduledAt`. Réutiliser
 * le type interne ferait dépendre la confidentialité d'un `select` correct,
 * qu'une évolution future élargirait sans que rien ne le signale. Ici,
 * ajouter un champ au blog est un acte explicite.
 */
@ObjectType()
export class PublicArticle {
  @Field(() => ID) id!: string
  @Field() title!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) renderedHtml?: string | null
  @Field(() => String, { nullable: true }) excerpt?: string | null
  @Field(() => String, { nullable: true }) coverImageUrl?: string | null
  @Field(() => Date, { nullable: true }) publishedAt?: Date | null
  @Field(() => Int) wordCount!: number

  @Field(() => String, { nullable: true }) seoTitle?: string | null
  @Field(() => String, { nullable: true }) metaDescription?: string | null
  @Field(() => String, { nullable: true }) canonicalUrl?: string | null
  @Field() robotsIndex!: boolean
  @Field() robotsFollow!: boolean
}

@ObjectType()
export class PublicArticleConnection extends Paginated(PublicArticle) {}

/** Vue publique d'un domaine : uniquement de quoi habiller le blog. */
@ObjectType()
export class PublicDomain {
  @Field(() => ID) id!: string
  @Field() name!: string
  @Field() slug!: string
  @Field(() => String, { nullable: true }) description?: string | null
  @Field() language!: string
}
```

- [ ] **Step 4 : Implémenter le service**

Créer `apps/api/src/public/public.service.ts`. Un `where` de base factorisé en une seule constante, utilisé par TOUTES les lectures :

```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { ArticleStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Conditions de visibilité publique d'un article. Factorisées en UNE
 * définition employée par toutes les lectures de ce service : une requête qui
 * les oublierait exposerait des brouillons, et le seul moyen fiable
 * d'empêcher cet oubli est qu'il n'existe pas de seconde formulation.
 *
 * `publishedAt <= maintenant` n'est pas redondant avec `status = PUBLISHED` :
 * `schedule()` (articles.service.ts) positionne `scheduledAt` sans
 * `publishedAt`, mais rien n'interdit qu'une reprise de données laisse un
 * PUBLISHED daté dans le futur. On filtre sur la date effective.
 */
function publishedWhere(domainId: string): Prisma.ArticleWhereInput {
  return {
    domainId,
    status: ArticleStatus.PUBLISHED,
    publishedAt: { not: null, lte: new Date() },
  }
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Résout un domaine par son slug. Un domaine sans aucun article publié est
   * traité comme inexistant : la base contient des domaines de test e2e qui
   * exposeraient sinon autant de blogs vides.
   */
  async domainBySlug(slug: string) {
    const domain = await this.prisma.domain.findUnique({ where: { slug } })
    if (!domain) throw new NotFoundException('Blog introuvable')

    const published = await this.prisma.article.count({ where: publishedWhere(domain.id) })
    if (published === 0) throw new NotFoundException('Blog introuvable')

    return domain
  }

  async articles(domainSlug: string, skip: number, take: number) {
    const domain = await this.domainBySlug(domainSlug)
    const where = publishedWhere(domain.id)

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.article.findMany({ where, orderBy: { publishedAt: 'desc' }, skip, take }),
      this.prisma.article.count({ where }),
    ])

    return { items, totalCount }
  }

  async articleBySlug(domainSlug: string, slug: string) {
    const domain = await this.domainBySlug(domainSlug)
    const article = await this.prisma.article.findFirst({ where: { ...publishedWhere(domain.id), slug } })
    if (!article) throw new NotFoundException('Article introuvable')
    return article
  }
}
```

- [ ] **Step 5 : Implémenter le résolveur et le module**

Créer `public.resolver.ts` avec trois `@Query()` marquées `@Public()` (importe le décorateur depuis là où `auth.resolver.ts` le prend), retournant les types de Step 3, et paginées via le `PageInput` existant (`apps/api/src/common/dto/page.input.ts` — lis-le pour les noms de champs réels).

Créer `public.module.ts` déclarant `PublicService` et `PublicResolver`, important le module Prisma comme le font les autres modules du projet. L'enregistrer dans `apps/api/src/app.module.ts` à côté des autres modules métier.

- [ ] **Step 6 : Vérifier que les tests passent**

Run: `cd apps/api && pnpm test:int -- public-blog`
Expected: PASS

Puis contrôle de mutation, obligatoire ici : retire temporairement `status: ArticleStatus.PUBLISHED` de `publishedWhere`, relance, et confirme que les tests d'absence échouent bel et bien. Restaure. Rapporte ce que tu as vu — une garde de confidentialité non éprouvée ne vaut rien.

- [ ] **Step 7 : Vérifier l'ensemble**

Run: `cd apps/api && npx tsc --noEmit && npx jest --runInBand && pnpm test:int`
Expected: tout passe.

- [ ] **Step 8 : Commit**

```bash
git add apps/api/src/public apps/api/src/app.module.ts apps/api/test/public-blog.int-spec.ts
git commit -m "feat(api): surface GraphQL publique du blog"
```

---

### Task 4 : Opérations GraphQL publiques et régénération

**Files:**
- Create: `packages/graphql/src/operations/public.graphql`
- Regenerated: `packages/graphql/schema.graphql`, `packages/graphql/src/generated.ts`

- [ ] **Step 1 : Écrire les opérations**

Créer `packages/graphql/src/operations/public.graphql` avec un fragment `PublicArticleFields` (tous les champs de `PublicArticle`) et trois opérations nommées : `PublicArticles`, `PublicArticle`, `PublicDomain`. Suis les conventions de nommage et d'ordre des fichiers voisins (`articles.graphql`, `topics.graphql`).

- [ ] **Step 2 : Régénérer**

Le SDL n'est écrit qu'au bootstrap hors production. Boote l'application localement — `NestFactory.create(AppModule)` puis `app.init()` puis `app.close()`, **sans `listen()`**, exécuté depuis `apps/api` pour que `process.cwd()` soit correct — puis supprime le script jetable. Ensuite, à la racine : `pnpm codegen`.

- [ ] **Step 3 : Vérifier**

```bash
git diff packages/graphql/schema.graphql
```

Expected: apparition de `type PublicArticle`, `type PublicArticleConnection`, `type PublicDomain` et des trois requêtes. **Contrôle décisif :** confirme que `type PublicArticle` ne contient PAS `rationale`. Puis `cd apps/web && npx tsc --noEmit`.

- [ ] **Step 4 : Commit**

```bash
git add packages/graphql
git commit -m "feat(graphql): operations publiques du blog"
```

---

### Task 5 : Page d'accueil du blog

**Files:**
- Modify: `apps/web/src/app/blog/[domainSlug]/layout.tsx`
- Create/replace: `apps/web/src/app/blog/[domainSlug]/page.tsx`

- [ ] **Step 1 : Implémenter**

Le layout affiche le nom et la description du domaine (via `PublicDomain`). La page liste les articles publiés, du plus récent au plus ancien, paginés — titre, extrait, date, image de couverture si présente — chaque entrée liant vers `/<articleSlug>` (l'URL vue par le lecteur, le préfixe `/blog/<slug>` étant interne à la réécriture).

Les données se lisent côté serveur **sans cookie** : réutilise `serverSdk` (`apps/web/src/lib/graphql-client.ts`) en lui passant `undefined`, ce qui n'envoie aucun en-tête d'authentification. Lis ce module avant : il documente pourquoi l'URL est calculée au chargement et pourquoi ça ne fonctionne que grâce à la séparation des bundles.

Un domaine inconnu ou sans article publié doit rendre la page 404 de Next (`notFound()` depuis `next/navigation`), la requête publique levant déjà `NOT_FOUND`.

Exporte les métadonnées SEO de la page (`generateMetadata`) à partir du nom et de la description du domaine.

- [ ] **Step 2 : Vérifier**

`cd apps/web && npx tsc --noEmit`, puis reconstruis le service `web` et :

```bash
curl -s -H "Host: cybersecurite.localhost:3000" http://localhost:3000/ | head -40
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: inconnu.localhost:3000" http://localhost:3000/
```

Expected: la première affiche les titres réels des articles publiés du domaine ; la seconde renvoie 404.

> Note : si le domaine n'a encore aucun article publié, publie-en un depuis le back-office avant de conclure que ça ne marche pas.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/app/blog
git commit -m "feat(web): accueil du blog public"
```

---

### Task 6 : Page d'article

**Files:**
- Create: `apps/web/src/app/blog/[domainSlug]/[articleSlug]/page.tsx`

- [ ] **Step 1 : Implémenter**

Rend `renderedHtml` (déjà calculé côté API, aucun Markdown à convertir ici), le titre, la date de publication, et l'image de couverture si présente. Un slug inconnu ou non publié rend `notFound()`.

`generateMetadata` doit produire le titre (`seoTitle` sinon `title`), la description (`metaDescription` sinon `excerpt`), l'URL canonique (`canonicalUrl` si présente), et traduire `robotsIndex` / `robotsFollow` en directives robots. Ces champs existent précisément pour ça et ne sont utilisés nulle part aujourd'hui.

`renderedHtml` provient du Markdown rédigé par l'équipe éditoriale et par le modèle, et il est injecté en HTML brut. Vérifie comment `renderContent` (`apps/api/src/articles/articles.service.ts`) le produit — s'il n'assainit pas la sortie, dis-le dans ton rapport plutôt que de l'assainir toi-même côté web : la décision appartient au propriétaire du pipeline de rendu, et un nettoyage appliqué des deux côtés risque d'en masquer l'absence de l'autre.

- [ ] **Step 2 : Vérifier**

`cd apps/web && npx tsc --noEmit`, puis sur l'application réelle :

```bash
curl -s -H "Host: cybersecurite.localhost:3000" http://localhost:3000/<slug-d-un-article-publie> | head -60
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: cybersecurite.localhost:3000" http://localhost:3000/slug-inexistant
```

Expected: le contenu de l'article ; puis 404.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/app/blog
git commit -m "feat(web): page d'article du blog public"
```

---

### Task 7 : Revalidation à la publication

**Files:**
- Create: `apps/web/src/app/api/revalidate/route.ts`
- Modify: `apps/api/src/articles/articles.service.ts`, `.env`, `.env.example`, `docker-compose.yml`

- [ ] **Step 1 : Écrire le webhook**

Créer `apps/web/src/app/api/revalidate/route.ts` : un `POST` qui refuse toute requête dont l'en-tête de secret ne correspond pas à `REVALIDATE_SECRET` (comparaison à temps constant, `node:crypto` `timingSafeEqual`), puis invalide le chemin de l'article ET la page d'accueil du domaine — publier un article qui n'apparaît pas dans la liste serait un demi-succès.

Réponds `401` sans détail sur un secret invalide, `400` sur un corps mal formé.

- [ ] **Step 2 : Déclencher depuis l'API**

`transitionArticle` (`apps/api/src/articles/articles.service.ts:218`) est l'entonnoir unique des changements de statut : accroche la notification là, après le commit de la transaction. Elle doit couvrir la publication, la dépublication et l'archivage — une page retirée doit disparaître aussi vite qu'elle est apparue.

L'appel ne doit JAMAIS faire échouer la transition : un blog momentanément périmé est un incident mineur, une publication qui échoue parce que le front ne répond pas en est un majeur. Journalise l'échec, ne le propage pas.

Ajoute `WEB_INTERNAL_URL` (`http://web:3001`) à `.env`, `.env.example` et à l'environnement du service `api` dans `docker-compose.yml`, et expose `REVALIDATE_SECRET` au service `web` (qui n'a pas d'`env_file` — chaque variable y est listée explicitement).

- [ ] **Step 3 : Écrire les tests**

Côté API : un test unitaire vérifiant qu'un échec du webhook ne fait pas échouer la transition. Côté web : un test du route handler pour le secret invalide et le corps mal formé.

- [ ] **Step 4 : Vérifier sur l'application réelle**

Publie un article depuis le back-office et constate qu'il apparaît sur le blog sans reconstruction ni redémarrage. C'est la seule preuve qui compte pour cette tâche.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/app/api/revalidate apps/api/src/articles/articles.service.ts .env.example docker-compose.yml
git commit -m "feat: revalider le blog public a la publication"
```

---

### Task 8 : Vérification d'ensemble

- [ ] **Step 1 : Suites complètes**

```bash
cd apps/api && npx tsc --noEmit && npx jest --runInBand && pnpm test:int
cd ../web && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 2 : Parcours réel**

Reconstruis `api`, `worker` et `web`, puis vérifie sur l'application : le blog d'un domaine s'affiche sur son sous-domaine ; un article s'ouvre ; le back-office reste accessible et protégé sur l'hôte nu ; un sous-domaine inconnu renvoie 404 ; un article publié depuis le back-office apparaît sans redémarrage.

- [ ] **Step 3 : Contrôle d'absence, à la main**

Sur le blog, tente de récupérer un article en `DRAFT` par son slug : la réponse doit être 404. Puis interroge directement `/graphql` **sans cookie** avec `publicArticles` et confirme qu'aucun brouillon n'apparaît. C'est le risque central du lot ; il se vérifie une dernière fois à la main, en plus des tests.

---

## Auto-revue

**Couverture de la spec** — Routage : Tasks 1 et 2. API publique et types séparés : Tasks 3 et 4. Accueil : Task 5. Article : Task 6. Revalidation : Task 7. Les tests d'absence exigés par la section Tests : Task 3 Step 1, plus le contrôle manuel de Task 8. B2 (catégories, tags, recherche, sitemap, robots, RSS) est explicitement hors de ce plan.

**Cohérence des types** — `domainSlugFromHost(host, rootHost)` (Task 1) est appelée avec cette signature dans `proxy.ts` (Task 2). `PublicArticle`, `PublicArticleConnection` et `PublicDomain` (Task 3) sont les types demandés par les opérations de Task 4 et consommés en Tasks 5 et 6. `publishedWhere(domainId)` est la seule définition de visibilité, utilisée par les trois lectures du service.

**Point d'attention** — Task 2 élargit le matcher du proxy de `/dashboard/:path*` à presque tout. La garde d'authentification doit rester conditionnée à `/dashboard`, sinon le back-office cesse d'être protégé ou devient inaccessible. C'est la régression la plus probable de ce lot ; Task 2 Step 4 et Task 8 Step 2 la vérifient toutes deux explicitement.
