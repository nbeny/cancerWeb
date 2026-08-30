import { Injectable } from '@nestjs/common'
import { ArticleVersion, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type Tx = Prisma.TransactionClient

@Injectable()
export class VersionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Prochain numéro de version pour l'article : jamais régressif. Restaurer
   * `v2` crée `v5` (si `v1..v4` existent déjà), pas un nouveau `v3` — c'est
   * ce qui garde l'historique strictement croissant et rend la restauration
   * elle-même réversible.
   */
  private async nextVersion(tx: Tx, articleId: string): Promise<number> {
    const latest = await tx.articleVersion.findFirst({ where: { articleId }, orderBy: { version: 'desc' } })
    return (latest?.version ?? 0) + 1
  }

  /**
   * Crée un instantané portant le contenu fourni par l'appelant (jamais
   * relu depuis la base ici) : c'est l'appelant — `ArticlesService` — qui
   * décide si l'instantané doit porter le contenu courant ou un contenu
   * restauré. Doit être appelé dans la même transaction que la mutation
   * qu'il accompagne (transition ou restauration) pour que statut/version
   * et instantané avancent ou reculent ensemble.
   *
   * Met aussi à jour `Article.currentVersion` (colonne dénormalisée) dans la
   * même transaction, pour qu'elle ne se désynchronise jamais du dernier
   * instantané réellement créé.
   */
  async snapshot(
    tx: Tx,
    articleId: string,
    createdById: string,
    title: string,
    content: string,
    changeNote?: string,
  ): Promise<ArticleVersion> {
    const version = await this.nextVersion(tx, articleId)
    const created = await tx.articleVersion.create({
      data: { articleId, version, title, content, changeNote, createdById },
    })
    await tx.article.update({ where: { id: articleId }, data: { currentVersion: version } })
    return created
  }

  /** Le domaine réel de l'article est vérifié par l'appelant (`ArticlesService.findForUser`) avant d'arriver ici. */
  async listForArticle(articleId: string): Promise<ArticleVersion[]> {
    return this.prisma.articleVersion.findMany({ where: { articleId }, orderBy: { version: 'desc' } })
  }

  async findVersion(articleId: string, version: number): Promise<ArticleVersion | null> {
    return this.prisma.articleVersion.findUnique({ where: { articleId_version: { articleId, version } } })
  }

  /**
   * Point d'entrée pour le Lot 2 : à appeler avant toute réécriture
   * automatisée (IA) d'un article, pour la rendre réversible. Aucun
   * consommateur dans ce lot — testé isolément en attendant.
   *
   * `createdById` : une réécriture automatisée n'a pas d'acteur humain
   * identifiable ; l'instantané est attribué à l'auteur de l'article plutôt
   * que d'exiger un utilisateur système fictif hors du périmètre de ce lot.
   */
  async snapshotBeforeAutomatedChange(articleId: string, reason: string): Promise<ArticleVersion> {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.article.findUniqueOrThrow({ where: { id: articleId } })
      return this.snapshot(tx, articleId, article.authorId, article.title, article.content, reason)
    })
  }
}
