import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Article, ArticleStatus, DomainRole } from '@prisma/client'
import { ArticlesService } from './articles.service'
import { RevalidationService } from './revalidation.service'
import { VersionsService } from './versions.service'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Tests unitaires de l'accrochage du webhook de revalidation sur
 * `transitionArticle` (Tâche 7 du lot « blog public »).
 *
 * Unitaires et non d'intégration pour l'essentiel : la propriété vérifiée ici
 * — « la transition aboutit MÊME SI la notification échoue » — exige de faire
 * échouer la notification à volonté, ce qu'un test d'intégration ne sait pas
 * provoquer sans truquer autant de choses qu'ici. La contrepartie (le slug de
 * domaine réellement transmis est bien celui de la base) est couverte, elle,
 * par `test/revalidation.int-spec.ts`.
 */

const DOMAIN_ID = 'dom-1'
const ARTICLE_ID = 'art-1'
const USER_ID = 'usr-1'

const article = (status: ArticleStatus): Article =>
  ({ id: ARTICLE_ID, domainId: DOMAIN_ID, slug: 'mon-article', status, title: 'Titre', content: '# Titre' }) as Article

/**
 * Fabrique le service avec des doubles minimalistes. `$transaction` exécute
 * le rappel avec le client de transaction lui-même, ce qui reproduit
 * fidèlement le mode interactif de Prisma sans base : le test observe donc le
 * VRAI enchaînement (mise à jour, instantané, puis notification hors
 * transaction), pas une version simplifiée.
 */
function build(statutInitial: ArticleStatus) {
  const tx = {
    article: {
      update: jest.fn().mockResolvedValue({ ...article(statutInitial), status: ArticleStatus.PUBLISHED }),
    },
  }
  const prisma = {
    domainMember: { findUnique: jest.fn().mockResolvedValue({ userId: USER_ID, domainId: DOMAIN_ID, role: DomainRole.OWNER }) },
    article: { findFirst: jest.fn().mockResolvedValue(article(statutInitial)) },
    domain: { findUnique: jest.fn().mockResolvedValue({ slug: 'cybersecurite' }) },
    $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
  }
  const versions = { snapshot: jest.fn().mockResolvedValue({ version: 2 }) }
  const revalidation = { notifyArticleChange: jest.fn().mockResolvedValue(undefined) }

  return { prisma, versions, revalidation, tx }
}

async function createService(doubles: ReturnType<typeof build>): Promise<ArticlesService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ArticlesService,
      { provide: PrismaService, useValue: doubles.prisma },
      { provide: VersionsService, useValue: doubles.versions },
      { provide: RevalidationService, useValue: doubles.revalidation },
    ],
  }).compile()
  return moduleRef.get(ArticlesService)
}

describe('ArticlesService — revalidation du blog public', () => {
  it("n'échoue pas quand le webhook de revalidation échoue", async () => {
    const doubles = build(ArticleStatus.APPROVED)
    doubles.revalidation.notifyArticleChange.mockRejectedValue(new Error('ECONNREFUSED web:3001'))
    // Le journal d'avertissement est attendu : on le neutralise pour ne pas
    // polluer la sortie, tout en vérifiant plus bas qu'il a bien été émis —
    // un échec silencieux serait aussi grave qu'une transition cassée.
    // Le `Logger` de Nest délègue à son prototype : l'espion attrape donc
    // l'instance privée du service sans avoir à y accéder.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const service = await createService(doubles)

    const resultat = await service.publishArticle(USER_ID, DOMAIN_ID, ARTICLE_ID)

    expect(resultat.status).toBe(ArticleStatus.PUBLISHED)
    expect(resultat.currentVersion).toBe(2)
    expect(doubles.revalidation.notifyArticleChange).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))
    warn.mockRestore()
  })

  it('notifie avec le slug du DOMAINE (pas son identifiant) et celui de l’article', async () => {
    const doubles = build(ArticleStatus.APPROVED)
    const service = await createService(doubles)

    await service.publishArticle(USER_ID, DOMAIN_ID, ARTICLE_ID)

    expect(doubles.prisma.domain.findUnique).toHaveBeenCalledWith({
      where: { id: DOMAIN_ID },
      select: { slug: true },
    })
    expect(doubles.revalidation.notifyArticleChange).toHaveBeenCalledWith('cybersecurite', 'mon-article')
  })

  it('notifie aussi à l’archivage : une page retirée doit disparaître du blog', async () => {
    const doubles = build(ArticleStatus.PUBLISHED)
    const service = await createService(doubles)

    await service.archiveArticle(USER_ID, DOMAIN_ID, ARTICLE_ID)

    expect(doubles.revalidation.notifyArticleChange).toHaveBeenCalledWith('cybersecurite', 'mon-article')
  })

  it("ne notifie pas — ni ne charge le domaine — pour une transition qui ne touche pas le blog public", async () => {
    const doubles = build(ArticleStatus.DRAFT)
    const service = await createService(doubles)

    await service.submitForReview(USER_ID, DOMAIN_ID, ARTICLE_ID)

    expect(doubles.revalidation.notifyArticleChange).not.toHaveBeenCalled()
    // La requête supplémentaire n'est PAS payée sur les transitions
    // ordinaires, qui sont les plus fréquentes.
    expect(doubles.prisma.domain.findUnique).not.toHaveBeenCalled()
  })

  it('notifie APRÈS le commit, jamais pendant la transaction', async () => {
    const doubles = build(ArticleStatus.APPROVED)
    const ordre: string[] = []
    doubles.prisma.$transaction.mockImplementation(async (cb) => {
      const resultat = await cb(doubles.tx)
      ordre.push('commit')
      return resultat
    })
    doubles.revalidation.notifyArticleChange.mockImplementation(async () => {
      ordre.push('notification')
    })
    const service = await createService(doubles)

    await service.publishArticle(USER_ID, DOMAIN_ID, ARTICLE_ID)

    // Notifier avant le commit ferait purger le cache du front pour qu'il
    // recharge... la version d'avant, si Postgres annulait ensuite.
    expect(ordre).toEqual(['commit', 'notification'])
  })
})
