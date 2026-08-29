import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Tag } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { slugify } from '../common/slug'
import { CreateTagInput } from './tag.types'

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, domainId: string, input: CreateTagInput): Promise<Tag> {
    await this.requireMember(userId, domainId)
    return this.prisma.$transaction(async (tx) => {
      const slug = await this.uniqueSlug(slugify(input.name), domainId, tx)
      return tx.tag.create({ data: { domainId, name: input.name, slug } })
    })
  }

  /** Ne retourne que les tags du domaine dont l'utilisateur est membre. */
  async listForDomain(userId: string, domainId: string): Promise<Tag[]> {
    await this.requireMember(userId, domainId)
    return this.prisma.tag.findMany({ where: { domainId }, orderBy: { name: 'asc' } })
  }

  /**
   * Supprime le tag. `ArticleTag.tag` est en `onDelete: Cascade` (voir
   * `schema.prisma`) : les associations article-tag disparaissent avec lui,
   * les articles eux-mêmes ne sont jamais touchés.
   */
  async remove(userId: string, domainId: string, id: string): Promise<boolean> {
    await this.requireMember(userId, domainId)
    const tag = await this.prisma.tag.findFirst({ where: { id, domainId } })
    if (!tag) throw new NotFoundException('Tag introuvable')
    await this.prisma.tag.delete({ where: { id } })
    return true
  }

  private async uniqueSlug(base: string, domainId: string, tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? base : `${base}-${i}`
      const existing = await tx.tag.findUnique({ where: { domainId_slug: { domainId, slug: candidate } } })
      if (!existing) return candidate
    }
  }

  /**
   * Vérifie l'appartenance au domaine indépendamment du guard : un appel
   * depuis un autre chemin ne doit pas pouvoir contourner l'isolation par
   * domaine simplement en sautant le resolver.
   */
  private async requireMember(userId: string, domainId: string): Promise<void> {
    const member = await this.prisma.domainMember.findUnique({
      where: { userId_domainId: { userId, domainId } },
    })
    if (!member) throw new NotFoundException('Domaine introuvable')
  }
}
