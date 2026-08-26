import { DomainRole } from '@prisma/client'
import { createHarness, errorCode, Harness } from './app-harness'
import { VersionsService } from '../src/articles/versions.service'

let h: Harness
beforeAll(async () => { h = await createHarness() })
afterAll(async () => { await h.close() })
beforeEach(async () => { await h.reset() })

const REGISTER = `mutation ($input: RegisterInput!) { register(input: $input) { user { id } } }`
const CREATE_DOMAIN = `mutation ($input: CreateDomainInput!) { createDomain(input: $input) { id } }`
const CREATE_ARTICLE = `
  mutation ($domainId: ID!, $input: CreateArticleInput!) {
    createArticle(domainId: $domainId, input: $input) { id title content status currentVersion }
  }`
const UPDATE_ARTICLE = `
  mutation ($domainId: ID!, $id: ID!, $input: UpdateArticleInput!) {
    updateArticle(domainId: $domainId, id: $id, input: $input) { id status currentVersion }
  }`
const SUBMIT = `mutation ($domainId: ID!, $id: ID!) { submitForReview(domainId: $domainId, id: $id) { id status } }`
const APPROVE = `mutation ($domainId: ID!, $id: ID!) { approveArticle(domainId: $domainId, id: $id) { id status } }`
const REJECT = `mutation ($domainId: ID!, $id: ID!) { rejectArticle(domainId: $domainId, id: $id) { id status } }`
const PUBLISH = `
  mutation ($domainId: ID!, $id: ID!) {
    publishArticle(domainId: $domainId, id: $id) { id status publishedAt scheduledAt }
  }`
const SCHEDULE = `
  mutation ($domainId: ID!, $id: ID!, $scheduledAt: DateTime!) {
    scheduleArticle(domainId: $domainId, id: $id, scheduledAt: $scheduledAt) { id status scheduledAt publishedAt }
  }`
const ARCHIVE = `mutation ($domainId: ID!, $id: ID!) { archiveArticle(domainId: $domainId, id: $id) { id status } }`
const VERSIONS = `
  query ($domainId: ID!, $articleId: ID!) {
    articleVersions(domainId: $domainId, articleId: $articleId) { version title content changeNote }
  }`
const CREATE_VERSION = `
  mutation ($domainId: ID!, $articleId: ID!, $changeNote: String) {
    createArticleVersion(domainId: $domainId, articleId: $articleId, changeNote: $changeNote) {
      version title content changeNote
    }
  }`
const RESTORE_VERSION = `
  mutation ($domainId: ID!, $articleId: ID!, $version: Int!) {
    restoreArticleVersion(domainId: $domainId, articleId: $articleId, version: $version) {
      id title content renderedHtml wordCount currentVersion
    }
  }`

async function signUp(email: string): Promise<{ cookies: string[]; userId: string }> {
  const res = await h.gql(REGISTER, { input: { email, password: 'Sup3r-Secret!', name: email.split('@')[0] } })
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.data.register.user.id }
}

async function createDomain(cookies: string[], name = 'Cybersécurité'): Promise<string> {
  const res = await h.gql(CREATE_DOMAIN, { input: { name } }, cookies)
  return res.body.data.createDomain.id
}

const baseArticleInput = (overrides: Record<string, unknown> = {}) => ({
  title: 'Mon article',
  content: '# Titre\n\nUn petit paragraphe de contenu.',
  ...overrides,
})

async function createArticle(cookies: string[], domainId: string, overrides = {}): Promise<string> {
  const res = await h.gql(CREATE_ARTICLE, { domainId, input: baseArticleInput(overrides) }, cookies)
  if (res.body.errors) throw new Error(`createArticle failed: ${JSON.stringify(res.body.errors)}`)
  return res.body.data.createArticle.id
}

/** Un domaine avec Alice (OWNER, créatrice) et un second membre de rôle `role`. */
async function setupDomainWithEditor(role: DomainRole) {
  const alice = await signUp('alice@example.com')
  const other = await signUp('other@example.com')
  const domainId = await createDomain(alice.cookies)
  await h.prisma.domainMember.create({ data: { domainId, userId: other.userId, role } })
  return { alice, other, domainId }
}

describe('workflow éditorial — transitions', () => {
  describe('chemin heureux complet, EDITOR bout en bout (sauf submit = AUTHOR)', () => {
    it('DRAFT -> REVIEW -> APPROVED -> PUBLISHED', async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)

      const submitted = await h.gql(SUBMIT, { domainId, id }, alice.cookies)
      expect(submitted.body.errors).toBeUndefined()
      expect(submitted.body.data.submitForReview.status).toBe('REVIEW')

      const approved = await h.gql(APPROVE, { domainId, id }, alice.cookies)
      expect(approved.body.errors).toBeUndefined()
      expect(approved.body.data.approveArticle.status).toBe('APPROVED')

      const published = await h.gql(PUBLISH, { domainId, id }, alice.cookies)
      expect(published.body.errors).toBeUndefined()
      expect(published.body.data.publishArticle.status).toBe('PUBLISHED')
      expect(published.body.data.publishArticle.publishedAt).not.toBeNull()
    })

    it('DRAFT -> REVIEW -> REVIEW rejetée -> DRAFT (rejet)', async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)
      await h.gql(SUBMIT, { domainId, id }, alice.cookies)

      const rejected = await h.gql(REJECT, { domainId, id }, alice.cookies)
      expect(rejected.body.errors).toBeUndefined()
      expect(rejected.body.data.rejectArticle.status).toBe('DRAFT')
    })

    it('APPROVED -> SCHEDULED -> PUBLISHED', async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)
      await h.gql(SUBMIT, { domainId, id }, alice.cookies)
      await h.gql(APPROVE, { domainId, id }, alice.cookies)

      const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      const scheduled = await h.gql(SCHEDULE, { domainId, id, scheduledAt: futureDate }, alice.cookies)
      expect(scheduled.body.errors).toBeUndefined()
      expect(scheduled.body.data.scheduleArticle.status).toBe('SCHEDULED')
      expect(scheduled.body.data.scheduleArticle.scheduledAt).not.toBeNull()
      expect(scheduled.body.data.scheduleArticle.publishedAt).toBeNull()

      const published = await h.gql(PUBLISH, { domainId, id }, alice.cookies)
      expect(published.body.errors).toBeUndefined()
      expect(published.body.data.publishArticle.status).toBe('PUBLISHED')
      expect(published.body.data.publishArticle.publishedAt).not.toBeNull()
    })

    it('PUBLISHED -> ARCHIVED', async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)
      await h.gql(SUBMIT, { domainId, id }, alice.cookies)
      await h.gql(APPROVE, { domainId, id }, alice.cookies)
      await h.gql(PUBLISH, { domainId, id }, alice.cookies)

      const archived = await h.gql(ARCHIVE, { domainId, id }, alice.cookies)
      expect(archived.body.errors).toBeUndefined()
      expect(archived.body.data.archiveArticle.status).toBe('ARCHIVED')
    })
  })

  it('AUTHOR peut soumettre (DRAFT -> REVIEW) : rôle minimum de la matrice', async () => {
    const { other: authorUser, domainId } = await setupDomainWithEditor(DomainRole.AUTHOR)
    const id = await createArticle(authorUser.cookies, domainId)

    const res = await h.gql(SUBMIT, { domainId, id }, authorUser.cookies)
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.submitForReview.status).toBe('REVIEW')
  })

  it('scheduleArticle avec une date passée est refusé', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId)
    await h.gql(SUBMIT, { domainId, id }, alice.cookies)
    await h.gql(APPROVE, { domainId, id }, alice.cookies)

    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const res = await h.gql(SCHEDULE, { domainId, id, scheduledAt: pastDate }, alice.cookies)

    expect(res.body.data?.scheduleArticle).toBeFalsy()
    expect(errorCode(res.body)).toBeDefined()

    const stored = await h.prisma.article.findUnique({ where: { id } })
    expect(stored?.status).toBe('APPROVED')
    expect(stored?.scheduledAt).toBeNull()
  })

  describe('atomicité transition + version', () => {
    it("un échec de la création de version annule aussi le changement de statut (rollback de la transaction)", async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)

      // Force l'échec de l'étape `versions.snapshot`, APRÈS que
      // `transitionArticle` a déjà écrit le nouveau statut dans la même
      // transaction interactive Prisma. Si l'atomicité tient, Postgres
      // annule aussi ce changement de statut. Le spy ne consomme qu'un seul
      // appel (`mockImplementationOnce`) et est explicitement restauré dans
      // le `finally`, pour ne laisser aucune mutation résiduelle sur un
      // service partagé par les autres tests de ce fichier.
      const versionsService = h.app.get(VersionsService)
      const spy = jest.spyOn(versionsService, 'snapshot').mockImplementationOnce(() => {
        throw new Error('échec injecté pour vérifier l’atomicité')
      })

      try {
        const res = await h.gql(SUBMIT, { domainId, id }, alice.cookies)
        expect(res.body.errors).toBeDefined()

        const stored = await h.prisma.article.findUnique({ where: { id } })
        expect(stored?.status).toBe('DRAFT') // pas resté à REVIEW malgré l'échec de la version

        const versions = await h.prisma.articleVersion.findMany({ where: { articleId: id } })
        expect(versions).toHaveLength(1) // seule v1 (création) existe ; aucune version en plus créée
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('transitions refusées renvoient FORBIDDEN, jamais NOT_FOUND', () => {
    it('un AUTHOR ne peut pas approuver (rôle insuffisant, refus au niveau du guard)', async () => {
      const { other: author, domainId } = await setupDomainWithEditor(DomainRole.AUTHOR)
      const id = await createArticle(author.cookies, domainId)
      await h.gql(SUBMIT, { domainId, id }, author.cookies)

      const res = await h.gql(APPROVE, { domainId, id }, author.cookies)
      expect(errorCode(res.body)).toBe('FORBIDDEN')

      const stored = await h.prisma.article.findUnique({ where: { id } })
      expect(stored?.status).toBe('REVIEW')
    })

    it('un EDITOR ne peut pas publier un article encore en DRAFT (transition inexistante, refus au niveau du service)', async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)

      const res = await h.gql(PUBLISH, { domainId, id }, alice.cookies)
      expect(errorCode(res.body)).toBe('FORBIDDEN')

      const stored = await h.prisma.article.findUnique({ where: { id } })
      expect(stored?.status).toBe('DRAFT')
    })

    it('un EDITOR ne peut pas archiver un article DRAFT (transition inexistante)', async () => {
      const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
      const id = await createArticle(alice.cookies, domainId)

      const res = await h.gql(ARCHIVE, { domainId, id }, alice.cookies)
      expect(errorCode(res.body)).toBe('FORBIDDEN')
    })

    it('un VIEWER ne peut déclencher aucune transition', async () => {
      const { other: viewer, domainId, alice } = await setupDomainWithEditor(DomainRole.VIEWER)
      const id = await createArticle(alice.cookies, domainId)

      const res = await h.gql(SUBMIT, { domainId, id }, viewer.cookies)
      expect(errorCode(res.body)).toBe('FORBIDDEN')
    })
  })
})

describe('workflow éditorial — versions', () => {
  it('v1 est créée à la création de l’article', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId, { content: 'Contenu initial.' })

    const res = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.articleVersions).toHaveLength(1)
    expect(res.body.data.articleVersions[0].version).toBe(1)
    expect(res.body.data.articleVersions[0].content).toBe('Contenu initial.')
  })

  it('chaque transition crée une version portant le libellé de la transition', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId)

    await h.gql(SUBMIT, { domainId, id }, alice.cookies)
    await h.gql(APPROVE, { domainId, id }, alice.cookies)
    await h.gql(PUBLISH, { domainId, id }, alice.cookies)
    await h.gql(ARCHIVE, { domainId, id }, alice.cookies)

    const res = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    const notes = (res.body.data.articleVersions as Array<{ changeNote: string | null }>)
      .map((v) => v.changeNote)
      .reverse() // remis en ordre chronologique (la query trie par version desc)

    expect(notes).toEqual([null, 'submit', 'approve', 'publish', 'archive'])
  })

  it('une simple modification de contenu ne crée PAS de version', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId)

    const before = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    expect(before.body.data.articleVersions).toHaveLength(1)

    const updated = await h.gql(
      UPDATE_ARTICLE,
      { domainId, id, input: { content: 'Contenu largement réécrit, plusieurs fois.' } },
      alice.cookies,
    )
    expect(updated.body.errors).toBeUndefined()

    const after = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    expect(after.body.data.articleVersions).toHaveLength(1) // toujours une seule version : v1
  })

  it('createArticleVersion crée un instantané à la demande avec changeNote', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId)

    const res = await h.gql(CREATE_VERSION, { domainId, articleId: id, changeNote: 'point de sauvegarde manuel' }, alice.cookies)
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data.createArticleVersion.version).toBe(2)
    expect(res.body.data.createArticleVersion.changeNote).toBe('point de sauvegarde manuel')

    const versions = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    expect(versions.body.data.articleVersions).toHaveLength(2)
  })

  it('restaurer v2 crée v5 avec le contenu de v2, et laisse v2 intacte (numéro toujours croissant)', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId, { content: 'Contenu v1.' })

    // v2 : createArticleVersion à la demande (contenu courant = v1 à ce stade)
    await h.gql(CREATE_VERSION, { domainId, articleId: id, changeNote: 'checkpoint' }, alice.cookies)
    // Modifie ensuite le contenu réel de l'article (ne crée pas de version, cf. test précédent)
    await h.gql(UPDATE_ARTICLE, { domainId, id, input: { content: 'Contenu v3-ish, différent de v2.' } }, alice.cookies)
    // v3 : transition
    await h.gql(SUBMIT, { domainId, id }, alice.cookies)
    // v4 : transition
    await h.gql(APPROVE, { domainId, id }, alice.cookies)

    const beforeRestore = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    expect(beforeRestore.body.data.articleVersions).toHaveLength(4) // v1..v4
    const v2 = (beforeRestore.body.data.articleVersions as Array<{ version: number; content: string }>).find(
      (v) => v.version === 2,
    )
    expect(v2?.content).toBe('Contenu v1.') // v2 = snapshot du contenu au moment du checkpoint

    const restored = await h.gql(RESTORE_VERSION, { domainId, articleId: id, version: 2 }, alice.cookies)
    expect(restored.body.errors).toBeUndefined()
    expect(restored.body.data.restoreArticleVersion.content).toBe('Contenu v1.')
    expect(restored.body.data.restoreArticleVersion.currentVersion).toBe(5)

    const afterRestore = await h.gql(VERSIONS, { domainId, articleId: id }, alice.cookies)
    expect(afterRestore.body.data.articleVersions).toHaveLength(5) // v1..v5, rien n'a régressé
    const versionNumbers = (afterRestore.body.data.articleVersions as Array<{ version: number }>)
      .map((v) => v.version)
      .sort((a, b) => a - b)
    expect(versionNumbers).toEqual([1, 2, 3, 4, 5])

    const v2StillThere = (afterRestore.body.data.articleVersions as Array<{ version: number; content: string }>).find(
      (v) => v.version === 2,
    )
    expect(v2StillThere?.content).toBe('Contenu v1.') // v2 intacte après la restauration

    const v5 = (afterRestore.body.data.articleVersions as Array<{ version: number; content: string }>).find(
      (v) => v.version === 5,
    )
    expect(v5?.content).toBe('Contenu v1.')
  })

  it('restaurer une version recalcule renderedHtml et wordCount à partir du contenu restauré', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId, { content: 'Un deux trois.' })

    await h.gql(UPDATE_ARTICLE, { domainId, id, input: { content: 'Un deux trois quatre cinq six sept huit.' } }, alice.cookies)

    const restored = await h.gql(RESTORE_VERSION, { domainId, articleId: id, version: 1 }, alice.cookies)
    expect(restored.body.errors).toBeUndefined()
    expect(restored.body.data.restoreArticleVersion.content).toBe('Un deux trois.')
    expect(restored.body.data.restoreArticleVersion.wordCount).toBe(3)
    expect(restored.body.data.restoreArticleVersion.renderedHtml).toContain('Un deux trois')

    const stored = await h.prisma.article.findUnique({ where: { id } })
    expect(stored?.wordCount).toBe(3)
    expect(stored?.renderedHtml).toBe(restored.body.data.restoreArticleVersion.renderedHtml)
  })

  it('le numéro de version est unique par article et ne régresse jamais, même entre deux articles distincts', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const idA = await createArticle(alice.cookies, domainId, { title: 'Article A' })
    const idB = await createArticle(alice.cookies, domainId, { title: 'Article B' })

    await h.gql(CREATE_VERSION, { domainId, articleId: idA, changeNote: 'x' }, alice.cookies)

    const versionsA = await h.gql(VERSIONS, { domainId, articleId: idA }, alice.cookies)
    const versionsB = await h.gql(VERSIONS, { domainId, articleId: idB }, alice.cookies)
    expect(versionsA.body.data.articleVersions).toHaveLength(2)
    expect(versionsB.body.data.articleVersions).toHaveLength(1) // indépendant par article
  })
})

describe('snapshotBeforeAutomatedChange — point d’entrée pour le Lot 2, sans consommateur ici', () => {
  it('crée une version portant le libellé fourni', async () => {
    const { alice, domainId } = await setupDomainWithEditor(DomainRole.EDITOR)
    const id = await createArticle(alice.cookies, domainId, { content: 'Contenu avant réécriture IA.' })

    const versionsService = h.app.get(VersionsService)
    const created = await versionsService.snapshotBeforeAutomatedChange(id, 'ai-rewrite:tone')

    expect(created.changeNote).toBe('ai-rewrite:tone')
    expect(created.version).toBe(2)
    expect(created.content).toBe('Contenu avant réécriture IA.')

    const stored = await h.prisma.articleVersion.findMany({ where: { articleId: id } })
    expect(stored).toHaveLength(2)
  })
})
