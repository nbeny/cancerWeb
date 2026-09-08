import { ArticleStatus, Prisma } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

// Toutes les requêtes de ce fichier sont envoyées SANS COOKIE : `h.gql` n'en
// pose un que si on le lui passe explicitement (voir `app-harness.ts`), et on
// ne le lui passe jamais ici. C'est le cœur du fichier : ces trois queries
// sont le premier chemin de LECTURE de l'application joignable sans session,
// donc tout ce qu'une erreur y exposerait est exposé à l'internet entier.
//
// Les fixtures sont écrites DIRECTEMENT en base plutôt que par les mutations
// du back-office, pour deux raisons : d'une part `status`/`publishedAt` sont
// justement les colonnes dont on veut fabriquer des combinaisons que le
// back-office n'autorise pas (un PUBLISHED daté dans le futur, un PUBLISHED
// sans date — reprises de données, migrations, écritures manuelles) ; d'autre
// part cela évite d'ouvrir une session dans un fichier dont la thèse est
// qu'aucune session n'existe.

const PUBLIC_ARTICLES = `
  query ($domainSlug: String!, $page: PageInput) {
    publicArticles(domainSlug: $domainSlug, page: $page) {
      items { id slug title publishedAt }
      totalCount
    }
  }`

const PUBLIC_ARTICLE = `
  query ($domainSlug: String!, $slug: String!) {
    publicArticle(domainSlug: $domainSlug, slug: $slug) {
      id slug title renderedHtml excerpt coverImageUrl publishedAt wordCount
      seoTitle metaDescription canonicalUrl robotsIndex robotsFollow
    }
  }`

const PUBLIC_DOMAIN = `
  query ($slug: String!) {
    publicDomain(slug: $slug) { id name slug description language }
  }`

const INTROSPECT_TYPE = `query ($name: String!) { __type(name: $name) { name fields { name } } }`

/** Auteur technique : les articles ont une clé étrangère `authorId` NOT NULL. */
async function seedAuthor(email = 'auteur@example.com'): Promise<string> {
  const user = await h.prisma.user.create({
    data: {
      email,
      // Aucune connexion n'a lieu dans ce fichier : ce condensat n'a pas
      // besoin d'être valide, seulement d'exister (colonne NOT NULL).
      passwordHash: 'inutilise-aucune-connexion-ici',
      name: 'Auteur',
      slug: `auteur-${email.split('@')[0]}`,
    },
  })
  return user.id
}

async function seedDomain(slug: string, name = 'Cybersécurité'): Promise<string> {
  const domain = await h.prisma.domain.create({ data: { name, slug, description: `À propos de ${name}` } })
  return domain.id
}

const HIER = new Date(Date.now() - 24 * 3600 * 1000)
const DEMAIN = new Date(Date.now() + 24 * 3600 * 1000)

async function seedArticle(
  domainId: string,
  authorId: string,
  overrides: Partial<Prisma.ArticleUncheckedCreateInput> = {},
): Promise<string> {
  const article = await h.prisma.article.create({
    data: {
      domainId,
      authorId,
      title: 'Un article',
      slug: 'un-article',
      content: '# Titre\n\nUn paragraphe.',
      renderedHtml: '<h1>Titre</h1>\n<p>Un paragraphe.</p>',
      // Justification éditoriale interne (Lot A) : présente sur TOUTES les
      // fixtures, y compris l'article publié, pour qu'un test de fuite ait
      // quelque chose à trouver si le type public venait à l'exposer.
      rationale: 'SECRET-INTERNE-justification-editoriale',
      status: ArticleStatus.PUBLISHED,
      publishedAt: HIER,
      wordCount: 4,
      ...overrides,
    },
  })
  return article.id
}

/** Domaine + auteur + un article publié : l'état nominal d'un blog en ligne. */
async function seedBlogPublie(slug = 'cybersecurite') {
  const authorId = await seedAuthor()
  const domainId = await seedDomain(slug)
  const articleId = await seedArticle(domainId, authorId, { title: 'Article publié', slug: 'article-publie' })
  return { authorId, domainId, articleId }
}

describe('blog public (aucune authentification)', () => {
  // Garde-fou du fichier lui-même. Sans lui, un jour où `GqlAuthGuard`
  // cesserait d'être enregistré comme APP_GUARD, TOUS les tests ci-dessous
  // resteraient verts sans plus rien prouver : ils vérifieraient une
  // exemption `@Public()` dans un monde où plus rien n'exige de session.
  // Cette assertion établit que `h.gql` sans cookie est bien anonyme ET que
  // l'anonymat est bien refusé partout ailleurs.
  it('le harness envoie bien des requêtes anonymes : le back-office les refuse', async () => {
    const { domainId } = await seedBlogPublie()

    const res = await h.gql(
      `query ($domainId: ID!) { articles(domainId: $domainId) { totalCount } }`,
      { domainId },
    )

    expect(errorCode(res.body)).toBe('UNAUTHENTICATED')
  })

  describe('publicArticles', () => {
    it('renvoie un article PUBLISHED du domaine', async () => {
      const { articleId } = await seedBlogPublie()

      const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'cybersecurite' })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.publicArticles.items).toHaveLength(1)
      expect(res.body.data.publicArticles.items[0].id).toBe(articleId)
      expect(res.body.data.publicArticles.totalCount).toBe(1)
    })

    // Le cœur de la tâche : une énumération de ce qui NE DOIT PAS sortir.
    // Chaque cas ajoute un article invisible à côté d'un article publié —
    // la présence de ce dernier garantit qu'un test vert signifie « le
    // filtre a trié » et non « la query est cassée et ne renvoie rien ».
    const invisibles: Array<[string, Partial<Prisma.ArticleUncheckedCreateInput>]> = [
      ['DRAFT', { status: ArticleStatus.DRAFT, publishedAt: null }],
      ['REVIEW', { status: ArticleStatus.REVIEW, publishedAt: null }],
      ['APPROVED', { status: ArticleStatus.APPROVED, publishedAt: null }],
      ['ARCHIVED (même avec une date de publication passée)', { status: ArticleStatus.ARCHIVED, publishedAt: HIER }],
      [
        'SCHEDULED dont publishedAt est dans le futur',
        { status: ArticleStatus.SCHEDULED, scheduledAt: DEMAIN, publishedAt: DEMAIN },
      ],
      // Cas ajouté après le contrôle de mutation (retrait temporaire de
      // `status: PUBLISHED` du filtre du service) : avec des brouillons tous
      // datés `null`, leur absence était en réalité garantie par le prédicat
      // de DATE, et retirer le filtre de statut ne cassait que le cas
      // ARCHIVED. Or un article NON publié portant une date de publication
      // passée n'a rien d'exotique — `archive` ne remet jamais `publishedAt`
      // à null (voir `transitions.ts`), et toute reprise de données qui
      // recule un statut sans toucher la date produit exactement ceci. C'est
      // ce cas-là qui rend le filtre de statut réellement porteur.
      [
        'DRAFT conservant une date de publication passée (dépublication, reprise de données)',
        { status: ArticleStatus.DRAFT, publishedAt: HIER },
      ],
      // Les deux cas suivants ne sont pas dans le plan mais couvrent chacun
      // une moitié de `publishedAt: { not: null, lte: maintenant }`. Sans
      // eux, ce prédicat pourrait être réduit à `status = PUBLISHED` sans
      // qu'aucun test ne bronche.
      ['PUBLISHED mais daté dans le futur', { status: ArticleStatus.PUBLISHED, publishedAt: DEMAIN }],
      ['PUBLISHED mais sans date de publication', { status: ArticleStatus.PUBLISHED, publishedAt: null }],
    ]

    it.each(invisibles)('n’inclut JAMAIS un article %s', async (_libelle, overrides) => {
      const { domainId, authorId, articleId } = await seedBlogPublie()
      const cacheId = await seedArticle(domainId, authorId, { title: 'Caché', slug: 'cache', ...overrides })

      const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'cybersecurite' })

      expect(res.body.errors).toBeUndefined()
      const ids = res.body.data.publicArticles.items.map((a: { id: string }) => a.id)
      expect(ids).toEqual([articleId])
      expect(ids).not.toContain(cacheId)
      // `totalCount` fuite autant qu'`items` : un compteur qui grimpe à
      // chaque brouillon révèle le volume de travail non publié.
      expect(res.body.data.publicArticles.totalCount).toBe(1)
    })

    it('n’inclut JAMAIS un article publié d’un AUTRE domaine', async () => {
      const { domainId, articleId } = await seedBlogPublie()
      const autreAuteur = await seedAuthor('autre@example.com')
      const autreDomaine = await seedDomain('finance', 'Finance')
      const intrusId = await seedArticle(autreDomaine, autreAuteur, { title: 'Intrus', slug: 'intrus' })
      // Le domaine d'origine reste peuplé : l'article `intrusId` n'a aucune
      // raison de se retrouver dans la liste de `cybersecurite`.
      expect(await h.prisma.article.count({ where: { domainId } })).toBe(1)

      const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'cybersecurite' })

      const ids = res.body.data.publicArticles.items.map((a: { id: string }) => a.id)
      expect(ids).toEqual([articleId])
      expect(ids).not.toContain(intrusId)
      expect(res.body.data.publicArticles.totalCount).toBe(1)
    })

    it('trie du plus récemment publié au plus ancien', async () => {
      const authorId = await seedAuthor()
      const domainId = await seedDomain('cybersecurite')
      const vieux = await seedArticle(domainId, authorId, {
        slug: 'vieux',
        publishedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      })
      const recent = await seedArticle(domainId, authorId, { slug: 'recent', publishedAt: HIER })

      const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'cybersecurite' })

      expect(res.body.data.publicArticles.items.map((a: { id: string }) => a.id)).toEqual([recent, vieux])
    })

    it('renvoie NOT_FOUND pour un slug de domaine inexistant', async () => {
      await seedBlogPublie()

      const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'domaine-inexistant' })

      expect(errorCode(res.body)).toBe('NOT_FOUND')
      expect(res.body.data?.publicArticles ?? null).toBeNull()
    })

    it('renvoie NOT_FOUND pour un domaine sans aucun article publié', async () => {
      const authorId = await seedAuthor()
      const domainId = await seedDomain('brouillons-seulement', 'Brouillons')
      await seedArticle(domainId, authorId, { status: ArticleStatus.DRAFT, publishedAt: null })

      const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'brouillons-seulement' })

      expect(errorCode(res.body)).toBe('NOT_FOUND')
    })

    describe('pagination fournie par l’appelant', () => {
      it('découpe la liste selon limit/offset sans altérer totalCount', async () => {
        const authorId = await seedAuthor()
        const domainId = await seedDomain('cybersecurite')
        for (let i = 0; i < 3; i++) {
          await seedArticle(domainId, authorId, {
            slug: `article-${i}`,
            publishedAt: new Date(Date.now() - (i + 1) * 3600 * 1000),
          })
        }

        const res = await h.gql(PUBLIC_ARTICLES, {
          domainSlug: 'cybersecurite',
          page: { limit: 2, offset: 1 },
        })

        expect(res.body.errors).toBeUndefined()
        expect(res.body.data.publicArticles.items.map((a: { slug: string }) => a.slug)).toEqual([
          'article-1',
          'article-2',
        ])
        expect(res.body.data.publicArticles.totalCount).toBe(3)
      })

      // Non demandé par le plan, mais c'est la seule entrée que l'appelant
      // contrôle sur une query anonyme : sans borne haute, `limit: 1000000`
      // ferait de chaque blog un levier de déni de service gratuit. On
      // vérifie donc que les contraintes de `PageInput` (@Min/@Max, voir
      // `common/dto/page.input.ts`) s'appliquent bien SANS session — le
      // ValidationPipe global est configuré dans main.ts et répliqué par le
      // harness, mais rien ne garantissait jusqu'ici qu'il couvre aussi un
      // resolver exempté d'authentification.
      const paginationsInvalides: Array<[string, { limit?: number; offset?: number }]> = [
        ['limit au-delà du maximum (100)', { limit: 101 }],
        ['limit démesuré', { limit: 1_000_000 }],
        ['limit nul', { limit: 0 }],
        ['offset négatif', { offset: -1 }],
      ]

      it.each(paginationsInvalides)('rejette une pagination invalide : %s', async (_libelle, page) => {
        await seedBlogPublie()

        const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'cybersecurite', page })

        expect(errorCode(res.body)).toBe('VALIDATION_FAILED')
        expect(res.body.data?.publicArticles ?? null).toBeNull()
      })

      it('accepte la borne haute exacte (limit: 100)', async () => {
        await seedBlogPublie()

        const res = await h.gql(PUBLIC_ARTICLES, { domainSlug: 'cybersecurite', page: { limit: 100, offset: 0 } })

        expect(res.body.errors).toBeUndefined()
        expect(res.body.data.publicArticles.totalCount).toBe(1)
      })
    })
  })

  describe('publicArticle', () => {
    it('renvoie l’article publié demandé par son slug', async () => {
      const { articleId } = await seedBlogPublie()

      const res = await h.gql(PUBLIC_ARTICLE, { domainSlug: 'cybersecurite', slug: 'article-publie' })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.publicArticle.id).toBe(articleId)
      expect(res.body.data.publicArticle.renderedHtml).toContain('<h1>')
      // Aucun champ interne ne doit apparaître dans la réponse sérialisée,
      // quelle que soit la richesse de l'entité Prisma renvoyée par le
      // service (elle porte `rationale`, `content`, `authorId`…).
      expect(JSON.stringify(res.body.data.publicArticle)).not.toContain('SECRET-INTERNE')
    })

    const slugsNonPublies: Array<[string, Partial<Prisma.ArticleUncheckedCreateInput>]> = [
      ['DRAFT', { status: ArticleStatus.DRAFT, publishedAt: null }],
      ['REVIEW', { status: ArticleStatus.REVIEW, publishedAt: null }],
      ['APPROVED', { status: ArticleStatus.APPROVED, publishedAt: null }],
      ['ARCHIVED', { status: ArticleStatus.ARCHIVED, publishedAt: HIER }],
      ['SCHEDULED daté dans le futur', { status: ArticleStatus.SCHEDULED, scheduledAt: DEMAIN, publishedAt: DEMAIN }],
      ['PUBLISHED daté dans le futur', { status: ArticleStatus.PUBLISHED, publishedAt: DEMAIN }],
      ['PUBLISHED sans date de publication', { status: ArticleStatus.PUBLISHED, publishedAt: null }],
      // Voir le commentaire homonyme sur `invisibles` ci-dessus : c'est le
      // seul cas où le filtre de STATUT est ce qui protège l'article, la date
      // étant, elle, parfaitement valide.
      ['DRAFT conservant une date de publication passée', { status: ArticleStatus.DRAFT, publishedAt: HIER }],
    ]

    it.each(slugsNonPublies)('renvoie NOT_FOUND pour le slug d’un article %s', async (_libelle, overrides) => {
      const { domainId, authorId } = await seedBlogPublie()
      await seedArticle(domainId, authorId, { title: 'Caché', slug: 'cache', ...overrides })

      const res = await h.gql(PUBLIC_ARTICLE, { domainSlug: 'cybersecurite', slug: 'cache' })

      expect(errorCode(res.body)).toBe('NOT_FOUND')
      expect(res.body.data?.publicArticle ?? null).toBeNull()
    })

    it('renvoie NOT_FOUND pour un slug d’un autre domaine', async () => {
      await seedBlogPublie()
      const autreAuteur = await seedAuthor('autre@example.com')
      const autreDomaine = await seedDomain('finance', 'Finance')
      await seedArticle(autreDomaine, autreAuteur, { title: 'Intrus', slug: 'intrus' })

      const res = await h.gql(PUBLIC_ARTICLE, { domainSlug: 'cybersecurite', slug: 'intrus' })

      expect(errorCode(res.body)).toBe('NOT_FOUND')
      expect(res.body.data?.publicArticle ?? null).toBeNull()
    })

    it('renvoie NOT_FOUND pour un slug de domaine inexistant', async () => {
      await seedBlogPublie()

      const res = await h.gql(PUBLIC_ARTICLE, { domainSlug: 'domaine-inexistant', slug: 'article-publie' })

      expect(errorCode(res.body)).toBe('NOT_FOUND')
    })

    // Deux domaines peuvent porter le MÊME slug d'article : la contrainte
    // d'unicité est `@@unique([domainId, slug])`, pas `slug` seul. Un
    // `findFirst` qui oublierait le domaine renverrait l'un ou l'autre, au
    // hasard de l'ordre physique des lignes.
    //
    // L'homonyme du voisin est PUBLIÉ, et inséré AVANT celui qu'on demande :
    // s'il était en brouillon, le filtre de statut suffirait à le masquer et
    // ce test ne prouverait plus rien sur l'isolation par domaine (vérifié
    // en retirant `domainId` du filtre du service — le test restait vert).
    it('ne confond pas deux articles de domaines différents portant le même slug', async () => {
      const { domainId, authorId } = await seedBlogPublie()
      const autreAuteur = await seedAuthor('autre@example.com')
      const autreDomaine = await seedDomain('finance', 'Finance')
      await seedArticle(autreDomaine, autreAuteur, { title: 'Homonyme du voisin', slug: 'homonyme' })
      const publieId = await seedArticle(domainId, authorId, { title: 'Homonyme publié', slug: 'homonyme' })

      const res = await h.gql(PUBLIC_ARTICLE, { domainSlug: 'cybersecurite', slug: 'homonyme' })

      expect(res.body.data.publicArticle.id).toBe(publieId)
      expect(res.body.data.publicArticle.title).toBe('Homonyme publié')
    })
  })

  describe('publicDomain', () => {
    it('renvoie le domaine dès qu’il a au moins un article publié', async () => {
      const { domainId } = await seedBlogPublie()

      const res = await h.gql(PUBLIC_DOMAIN, { slug: 'cybersecurite' })

      expect(res.body.errors).toBeUndefined()
      expect(res.body.data.publicDomain).toMatchObject({
        id: domainId,
        name: 'Cybersécurité',
        slug: 'cybersecurite',
        language: 'fr',
      })
    })

    it('renvoie NOT_FOUND pour un slug de domaine inexistant', async () => {
      await seedBlogPublie()

      const res = await h.gql(PUBLIC_DOMAIN, { slug: 'domaine-inexistant' })

      expect(errorCode(res.body)).toBe('NOT_FOUND')
      expect(res.body.data?.publicDomain ?? null).toBeNull()
    })

    it('renvoie NOT_FOUND pour un domaine sans aucun article publié', async () => {
      const authorId = await seedAuthor()
      const domainId = await seedDomain('domaine-de-test', 'Domaine de test')
      await seedArticle(domainId, authorId, { status: ArticleStatus.DRAFT, publishedAt: null })
      await seedArticle(domainId, authorId, {
        slug: 'programme',
        status: ArticleStatus.SCHEDULED,
        scheduledAt: DEMAIN,
        publishedAt: DEMAIN,
      })

      const res = await h.gql(PUBLIC_DOMAIN, { slug: 'domaine-de-test' })

      // L'existence même du domaine ne doit pas transparaître : un domaine
      // dont rien n'est publié n'est pas un blog, c'est un espace de travail
      // privé (et la base d'e2e en crée quantité).
      expect(errorCode(res.body)).toBe('NOT_FOUND')
    })
  })

  // Ces trois derniers tests ne lisent aucune valeur : ils constatent que
  // certains champs N'EXISTENT PAS dans le schéma. C'est l'assertion qui
  // empêche qu'on rebranche un jour `Article` (article.types.ts) derrière
  // `publicArticles` sans s'en apercevoir — un tel remplacement passerait
  // tous les tests de filtrage ci-dessus sans en casser un seul.
  describe('surface du schéma public', () => {
    const CHAMPS_INTERDITS_ARTICLE = [
      'rationale',
      'content',
      'authorId',
      'topicId',
      'domainId',
      'categoryId',
      'status',
      'latestSeoScore',
      'scheduledAt',
      'currentVersion',
      'focusKeyword',
      'secondaryKeywords',
    ]

    it('le type PublicArticle n’expose aucun champ interne', async () => {
      const res = await h.gql(INTROSPECT_TYPE, { name: 'PublicArticle' })

      expect(res.body.errors).toBeUndefined()
      const champs: string[] = res.body.data.__type.fields.map((f: { name: string }) => f.name)
      // Le type doit exister et être peuplé : une faute de frappe sur son
      // nom rendrait les assertions suivantes vraies pour rien.
      expect(champs).toContain('slug')
      for (const interdit of CHAMPS_INTERDITS_ARTICLE) expect(champs).not.toContain(interdit)
    })

    it('demander `rationale` sur PublicArticle échoue à la validation GraphQL', async () => {
      await seedBlogPublie()

      const res = await h.gql(
        `query { publicArticle(domainSlug: "cybersecurite", slug: "article-publie") { id rationale } }`,
      )

      expect(errorCode(res.body)).toBe('GRAPHQL_VALIDATION_FAILED')
      expect(res.body.data).toBeUndefined()
    })

    // Même raisonnement côté domaine : `aiInstructions` est le prompt
    // éditorial interne, `excludedTopics`/`keywords` la stratégie de
    // contenu. Rien de tout cela n'a sa place sur un blog public.
    it('le type PublicDomain n’expose aucun réglage éditorial interne', async () => {
      const res = await h.gql(INTROSPECT_TYPE, { name: 'PublicDomain' })

      const champs: string[] = res.body.data.__type.fields.map((f: { name: string }) => f.name)
      expect(champs).toContain('slug')
      for (const interdit of [
        'aiInstructions',
        'keywords',
        'excludedTopics',
        'targetAudience',
        'autoPublish',
        'reviewOutline',
        'tone',
        'expertiseLevel',
      ]) {
        expect(champs).not.toContain(interdit)
      }
    })
  })
})
