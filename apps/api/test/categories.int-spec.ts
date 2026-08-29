import { createHarness, errorCode, Harness } from './app-harness'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) { createArticle(domainId: $domainId, input: $input) { id categoryId } }`

const CREATE_CATEGORY = `
  mutation ($domainId: ID!, $input: CreateCategoryInput!) {
    createCategory(domainId: $domainId, input: $input) { id name slug description parentId }
  }`
const UPDATE_CATEGORY = `
  mutation ($domainId: ID!, $id: ID!, $input: UpdateCategoryInput!) {
    updateCategory(domainId: $domainId, id: $id, input: $input) { id name slug description parentId }
  }`
const DELETE_CATEGORY = `mutation ($domainId: ID!, $id: ID!) { deleteCategory(domainId: $domainId, id: $id) }`
const LIST_CATEGORIES = `query ($domainId: ID!) { categories(domainId: $domainId) { id name slug parentId } }`
const GET_CATEGORY = `
  query ($domainId: ID!, $id: ID!) {
    category(domainId: $domainId, id: $id) { id name slug parentId children { id } articleCount }
  }`

const CREATE_TAG = `
  mutation ($domainId: ID!, $input: CreateTagInput!) { createTag(domainId: $domainId, input: $input) { id name slug } }`
const DELETE_TAG = `mutation ($domainId: ID!, $id: ID!) { deleteTag(domainId: $domainId, id: $id) }`
const LIST_TAGS = `query ($domainId: ID!) { tags(domainId: $domainId) { id name slug } }`

const SET_ARTICLE_CATEGORY = `
  mutation ($domainId: ID!, $articleId: ID!, $categoryId: ID) {
    setArticleCategory(domainId: $domainId, articleId: $articleId, categoryId: $categoryId) { id categoryId }
  }`
const SET_ARTICLE_TAGS = `
  mutation ($domainId: ID!, $articleId: ID!, $tagIds: [ID!]!) {
    setArticleTags(domainId: $domainId, articleId: $articleId, tagIds: $tagIds) { id tags { id name } }
  }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

async function createDomain(cookies: string[], name = 'Cybersécurité'): Promise<string> {
  const res = await h.gql(CREATE_DOMAIN, { input: { name } }, cookies)
  return res.body.data.createDomain.id
}

async function createCategory(
  cookies: string[],
  domainId: string,
  input: Record<string, unknown> = { name: 'Actualités' },
): Promise<{ id: string; name: string; slug: string; description: string | null; parentId: string | null }> {
  const res = await h.gql(CREATE_CATEGORY, { domainId, input }, cookies)
  if (res.body.errors) throw new Error(`createCategory failed: ${JSON.stringify(res.body.errors)}`)
  return res.body.data.createCategory
}

describe('catégories', () => {
  it('crée une catégorie et génère son slug', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)

    const category = await createCategory(cookies, domainId, { name: 'Actualités', description: 'Les news' })

    expect(category.slug).toBe('actualites')
    expect(category.description).toBe('Les news')
    const stored = await h.prisma.category.findUnique({ where: { id: category.id } })
    expect(stored?.domainId).toBe(domainId)
  })

  it('rend le slug unique PAR DOMAINE : collision locale suffixée, mais le même nom ailleurs redonne le slug de base', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const otherDomainId = await createDomain(cookies, 'Autre domaine')

    const first = await createCategory(cookies, domainId, { name: 'Actualités' })
    const second = await createCategory(cookies, domainId, { name: 'Actualités' })
    const elsewhere = await createCategory(cookies, otherDomainId, { name: 'Actualités' })

    expect(first.slug).toBe('actualites')
    expect(second.slug).toBe('actualites-1')
    expect(elsewhere.slug).toBe('actualites')
  })

  it('liste, lit, met à jour et supprime une catégorie', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const category = await createCategory(cookies, domainId)

    const list = await h.gql(LIST_CATEGORIES, { domainId }, cookies)
    expect(list.body.data.categories).toHaveLength(1)

    const got = await h.gql(GET_CATEGORY, { domainId, id: category.id }, cookies)
    expect(got.body.data.category.id).toBe(category.id)
    expect(got.body.data.category.children).toEqual([])
    expect(got.body.data.category.articleCount).toBe(0)

    const updated = await h.gql(UPDATE_CATEGORY, { domainId, id: category.id, input: { name: 'Actus' } }, cookies)
    expect(updated.body.errors).toBeUndefined()
    expect(updated.body.data.updateCategory.name).toBe('Actus')
    // Le slug n'est pas régénéré à la mise à jour du nom (comme Domain/Article).
    expect(updated.body.data.updateCategory.slug).toBe('actualites')

    const del = await h.gql(DELETE_CATEGORY, { domainId, id: category.id }, cookies)
    expect(del.body.data.deleteCategory).toBe(true)
    expect(await h.prisma.category.count()).toBe(0)
  })

  describe('hiérarchie', () => {
    it('une catégorie peut avoir un parent, exposé via `parent` et `children`', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const parent = await createCategory(cookies, domainId, { name: 'Parent' })
      const child = await createCategory(cookies, domainId, { name: 'Enfant', parentId: parent.id })

      expect(child.parentId).toBe(parent.id)

      const got = await h.gql(GET_CATEGORY, { domainId, id: parent.id }, cookies)
      expect(got.body.data.category.children).toEqual([{ id: child.id }])
    })

    it('refuse un auto-parentage', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const a = await createCategory(cookies, domainId, { name: 'AA' })

      const res = await h.gql(UPDATE_CATEGORY, { domainId, id: a.id, input: { parentId: a.id } }, cookies)
      expect(res.body.data?.updateCategory).toBeFalsy()
      expect(errorCode(res.body)).toBeDefined()

      const unchanged = await h.prisma.category.findUnique({ where: { id: a.id } })
      expect(unchanged?.parentId).toBeNull()
    })

    it('refuse un cycle direct (A parent de B, puis B parent de A)', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const a = await createCategory(cookies, domainId, { name: 'AA' })
      const b = await createCategory(cookies, domainId, { name: 'BB', parentId: a.id })

      const res = await h.gql(UPDATE_CATEGORY, { domainId, id: a.id, input: { parentId: b.id } }, cookies)
      expect(res.body.data?.updateCategory).toBeFalsy()
      expect(errorCode(res.body)).toBeDefined()

      const unchanged = await h.prisma.category.findUnique({ where: { id: a.id } })
      expect(unchanged?.parentId).toBeNull()
    })

    it('refuse un cycle INDIRECT (A -> B -> C, puis A parent de C)', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const a = await createCategory(cookies, domainId, { name: 'AA' })
      const b = await createCategory(cookies, domainId, { name: 'BB', parentId: a.id })
      const c = await createCategory(cookies, domainId, { name: 'CC', parentId: b.id })

      // A -> B -> C existe déjà. Rendre C parent de A créerait un cycle
      // A -> B -> C -> A, indétectable en ne regardant que le parent DIRECT
      // proposé (C) : il faut remonter toute la chaîne d'ancêtres de C.
      const res = await h.gql(UPDATE_CATEGORY, { domainId, id: a.id, input: { parentId: c.id } }, cookies)
      expect(res.body.data?.updateCategory).toBeFalsy()
      expect(errorCode(res.body)).toBeDefined()

      const unchanged = await h.prisma.category.findUnique({ where: { id: a.id } })
      expect(unchanged?.parentId).toBeNull()
    })

    it('supprimer une catégorie ayant des enfants les détache (deviennent racines), sans les supprimer', async () => {
      const { cookies } = await signUp('alice@example.com')
      const domainId = await createDomain(cookies)
      const parent = await createCategory(cookies, domainId, { name: 'Parent' })
      const child = await createCategory(cookies, domainId, { name: 'Enfant', parentId: parent.id })

      const del = await h.gql(DELETE_CATEGORY, { domainId, id: parent.id }, cookies)
      expect(del.body.data.deleteCategory).toBe(true)

      const survivor = await h.prisma.category.findUnique({ where: { id: child.id } })
      expect(survivor).not.toBeNull()
      expect(survivor?.parentId).toBeNull()
    })
  })

  it("supprimer une catégorie utilisée par un article met categoryId à null sans supprimer l'article", async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const category = await createCategory(cookies, domainId)
    const article = await h.gql(
      CREATE_ARTICLE,
      { domainId, input: { title: 'Un article', content: 'Contenu suffisant.', categoryId: category.id } },
      cookies,
    )
    const articleId = article.body.data.createArticle.id
    expect(article.body.data.createArticle.categoryId).toBe(category.id)

    await h.gql(DELETE_CATEGORY, { domainId, id: category.id }, cookies)

    const survivor = await h.prisma.article.findUnique({ where: { id: articleId } })
    expect(survivor).not.toBeNull()
    expect(survivor?.categoryId).toBeNull()
  })

  describe('confusion de domaine', () => {
    it("interdit d'atteindre la catégorie d'un autre domaine via un domainId dont on est membre", async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const idAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const idBob = await createDomain(bob.cookies, 'Domaine Bob')
      const categoryBob = await createCategory(bob.cookies, idBob, { name: 'Confidentiel' })

      const usurpation = await h.gql(
        UPDATE_CATEGORY,
        { domainId: idAlice, id: categoryBob.id, input: { name: 'Détourné' } },
        alice.cookies,
      )
      expect(usurpation.body.data?.updateCategory).toBeFalsy()
      expect(['FORBIDDEN', 'NOT_FOUND']).toContain(errorCode(usurpation.body))

      const intact = await h.prisma.category.findUnique({ where: { id: categoryBob.id } })
      expect(intact?.name).toBe('Confidentiel')
    })

    it('ferme le même chemin sur deleteCategory', async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const idAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const idBob = await createDomain(bob.cookies, 'Domaine Bob')
      const categoryBob = await createCategory(bob.cookies, idBob, { name: 'Confidentiel' })

      const res = await h.gql(DELETE_CATEGORY, { domainId: idAlice, id: categoryBob.id }, alice.cookies)
      expect(res.body.data?.deleteCategory).toBeFalsy()
      expect(await h.prisma.category.count()).toBe(1)
    })

    it('ferme le même chemin sur la lecture (category)', async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const idAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const idBob = await createDomain(bob.cookies, 'Domaine Bob')
      const categoryBob = await createCategory(bob.cookies, idBob, { name: 'Confidentiel' })

      const res = await h.gql(GET_CATEGORY, { domainId: idAlice, id: categoryBob.id }, alice.cookies)
      expect(res.body.data?.category ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })
  })

  describe('isolation par domaine — un non-membre ne peut rien faire', () => {
    async function setup() {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const domainId = await createDomain(alice.cookies)
      const category = await createCategory(alice.cookies, domainId)
      return { alice, bob, domainId, category }
    }

    it('ne peut pas créer', async () => {
      const { bob, domainId } = await setup()
      const res = await h.gql(CREATE_CATEGORY, { domainId, input: { name: 'Intrus' } }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      expect(await h.prisma.category.count()).toBe(1)
    })

    it('ne peut pas lister', async () => {
      const { bob, domainId } = await setup()
      const res = await h.gql(LIST_CATEGORIES, { domainId }, bob.cookies)
      expect(res.body.data?.categories ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })

    it('ne peut pas lire', async () => {
      const { bob, domainId, category } = await setup()
      const res = await h.gql(GET_CATEGORY, { domainId, id: category.id }, bob.cookies)
      expect(res.body.data?.category ?? null).toBeNull()
      expect(errorCode(res.body)).toBeDefined()
    })

    it('ne peut pas modifier', async () => {
      const { bob, domainId, category } = await setup()
      const res = await h.gql(UPDATE_CATEGORY, { domainId, id: category.id, input: { name: 'Piraté' } }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      const unchanged = await h.prisma.category.findUnique({ where: { id: category.id } })
      expect(unchanged?.name).toBe('Actualités')
    })

    it('ne peut pas supprimer', async () => {
      const { bob, domainId, category } = await setup()
      const res = await h.gql(DELETE_CATEGORY, { domainId, id: category.id }, bob.cookies)
      expect(errorCode(res.body)).toBeDefined()
      expect(await h.prisma.category.count()).toBe(1)
    })

    it('ne peut pas créer de tag ni en lister', async () => {
      const { bob, domainId } = await setup()
      const create = await h.gql(CREATE_TAG, { domainId, input: { name: 'Intrus' } }, bob.cookies)
      expect(errorCode(create.body)).toBeDefined()
      expect(await h.prisma.tag.count()).toBe(0)

      const list = await h.gql(LIST_TAGS, { domainId }, bob.cookies)
      expect(list.body.data?.tags ?? null).toBeNull()
      expect(errorCode(list.body)).toBeDefined()
    })
  })
})

describe('tags', () => {
  async function createTag(
    cookies: string[],
    domainId: string,
    name = 'Sécurité',
  ): Promise<{ id: string; name: string; slug: string }> {
    const res = await h.gql(CREATE_TAG, { domainId, input: { name } }, cookies)
    if (res.body.errors) throw new Error(`createTag failed: ${JSON.stringify(res.body.errors)}`)
    return res.body.data.createTag
  }

  it('crée un tag, le liste et le supprime', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)

    const tag = await createTag(cookies, domainId, 'Sécurité')
    expect(tag.slug).toBe('securite')

    const list = await h.gql(LIST_TAGS, { domainId }, cookies)
    expect(list.body.data.tags).toHaveLength(1)

    const del = await h.gql(DELETE_TAG, { domainId, id: tag.id }, cookies)
    expect(del.body.data.deleteTag).toBe(true)
    expect(await h.prisma.tag.count()).toBe(0)
  })

  it('rend le slug de tag unique PAR DOMAINE', async () => {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const otherDomainId = await createDomain(cookies, 'Autre domaine')

    const first = await createTag(cookies, domainId, 'Sécurité')
    const second = await createTag(cookies, domainId, 'Sécurité')
    const elsewhere = await createTag(cookies, otherDomainId, 'Sécurité')

    expect(first.slug).toBe('securite')
    expect(second.slug).toBe('securite-1')
    expect(elsewhere.slug).toBe('securite')
  })

  describe('confusion de domaine', () => {
    it('ferme le chemin sur deleteTag', async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const idAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const idBob = await createDomain(bob.cookies, 'Domaine Bob')
      const tagBob = await createTag(bob.cookies, idBob, 'Confidentiel')

      const res = await h.gql(DELETE_TAG, { domainId: idAlice, id: tagBob.id }, alice.cookies)
      expect(res.body.data?.deleteTag).toBeFalsy()
      expect(await h.prisma.tag.count()).toBe(1)
    })
  })
})

describe('affectation catégorie/tags sur un article', () => {
  async function setup() {
    const { cookies } = await signUp('alice@example.com')
    const domainId = await createDomain(cookies)
    const article = await h.gql(
      CREATE_ARTICLE,
      { domainId, input: { title: 'Un article', content: 'Contenu suffisant.' } },
      cookies,
    )
    const articleId = article.body.data.createArticle.id
    return { cookies, domainId, articleId }
  }

  it('setArticleCategory affecte puis efface la catégorie', async () => {
    const { cookies, domainId, articleId } = await setup()
    const category = await h.gql(CREATE_CATEGORY, { domainId, input: { name: 'Actualités' } }, cookies)
    const categoryId = category.body.data.createCategory.id

    const set = await h.gql(SET_ARTICLE_CATEGORY, { domainId, articleId, categoryId }, cookies)
    expect(set.body.errors).toBeUndefined()
    expect(set.body.data.setArticleCategory.categoryId).toBe(categoryId)

    const cleared = await h.gql(SET_ARTICLE_CATEGORY, { domainId, articleId, categoryId: null }, cookies)
    expect(cleared.body.errors).toBeUndefined()
    expect(cleared.body.data.setArticleCategory.categoryId).toBeNull()
  })

  it("refuse une catégorie d'un autre domaine", async () => {
    const { cookies, domainId, articleId } = await setup()
    const otherDomainId = await createDomain(cookies, 'Autre domaine')
    const category = await h.gql(CREATE_CATEGORY, { domainId: otherDomainId, input: { name: 'Ailleurs' } }, cookies)
    const categoryId = category.body.data.createCategory.id

    const res = await h.gql(SET_ARTICLE_CATEGORY, { domainId, articleId, categoryId }, cookies)
    expect(res.body.data?.setArticleCategory).toBeFalsy()
    expect(errorCode(res.body)).toBeDefined()

    const unchanged = await h.prisma.article.findUnique({ where: { id: articleId } })
    expect(unchanged?.categoryId).toBeNull()
  })

  it('setArticleTags REMPLACE l’ensemble (pas d’ajout incrémental) et supprime les associations orphelines', async () => {
    const { cookies, domainId, articleId } = await setup()
    const tagA = await h.gql(CREATE_TAG, { domainId, input: { name: 'AA' } }, cookies)
    const tagB = await h.gql(CREATE_TAG, { domainId, input: { name: 'BB' } }, cookies)
    const tagC = await h.gql(CREATE_TAG, { domainId, input: { name: 'CC' } }, cookies)
    const idA = tagA.body.data.createTag.id
    const idB = tagB.body.data.createTag.id
    const idC = tagC.body.data.createTag.id

    const first = await h.gql(SET_ARTICLE_TAGS, { domainId, articleId, tagIds: [idA, idB] }, cookies)
    expect(first.body.errors).toBeUndefined()
    expect(new Set(first.body.data.setArticleTags.tags.map((t: { id: string }) => t.id))).toEqual(new Set([idA, idB]))
    expect(await h.prisma.articleTag.count({ where: { articleId } })).toBe(2)

    // Remplace : B et C restent/entrent, A doit disparaître (pas d'ajout incrémental).
    const second = await h.gql(SET_ARTICLE_TAGS, { domainId, articleId, tagIds: [idB, idC] }, cookies)
    expect(second.body.errors).toBeUndefined()
    const ids = second.body.data.setArticleTags.tags.map((t: { id: string }) => t.id)
    expect(new Set(ids)).toEqual(new Set([idB, idC]))
    expect(await h.prisma.articleTag.count({ where: { articleId } })).toBe(2)
    expect(await h.prisma.articleTag.findFirst({ where: { articleId, tagId: idA } })).toBeNull()

    // Vide la liste : plus aucune association, mais les tags eux-mêmes survivent.
    const cleared = await h.gql(SET_ARTICLE_TAGS, { domainId, articleId, tagIds: [] }, cookies)
    expect(cleared.body.errors).toBeUndefined()
    expect(cleared.body.data.setArticleTags.tags).toEqual([])
    expect(await h.prisma.articleTag.count({ where: { articleId } })).toBe(0)
    expect(await h.prisma.tag.count()).toBe(3)
  })

  it("refuse un tag d'un autre domaine", async () => {
    const { cookies, domainId, articleId } = await setup()
    const otherDomainId = await createDomain(cookies, 'Autre domaine')
    const tag = await h.gql(CREATE_TAG, { domainId: otherDomainId, input: { name: 'Ailleurs' } }, cookies)
    const tagId = tag.body.data.createTag.id

    const res = await h.gql(SET_ARTICLE_TAGS, { domainId, articleId, tagIds: [tagId] }, cookies)
    expect(res.body.data?.setArticleTags).toBeFalsy()
    expect(errorCode(res.body)).toBeDefined()
    expect(await h.prisma.articleTag.count({ where: { articleId } })).toBe(0)
  })

  describe('confusion de domaine sur les mutations d’affectation', () => {
    it('ferme le chemin sur setArticleCategory', async () => {
      const alice = await signUp('alice@example.com')
      const bob = await signUp('bob@example.com')
      const idAlice = await createDomain(alice.cookies, 'Domaine Alice')
      const idBob = await createDomain(bob.cookies, 'Domaine Bob')
      const articleBob = await h.gql(
        CREATE_ARTICLE,
        { domainId: idBob, input: { title: 'Confidentiel', content: 'Contenu confidentiel de Bob.' } },
        bob.cookies,
      )
      const articleId = articleBob.body.data.createArticle.id
      const categoryAlice = await h.gql(CREATE_CATEGORY, { domainId: idAlice, input: { name: 'Alice' } }, alice.cookies)
      const categoryId = categoryAlice.body.data.createCategory.id

      const res = await h.gql(SET_ARTICLE_CATEGORY, { domainId: idAlice, articleId, categoryId }, alice.cookies)
      expect(res.body.data?.setArticleCategory).toBeFalsy()
      expect(['FORBIDDEN', 'NOT_FOUND']).toContain(errorCode(res.body))

      const intact = await h.prisma.article.findUnique({ where: { id: articleId } })
      expect(intact?.categoryId).toBeNull()
    })
  })
})
