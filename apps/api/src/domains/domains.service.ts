import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Domain, DomainRole, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { slugify } from '../common/slug'
import { CreateDomainInput, UpdateDomainInput } from './domain.types'
import { PageInput } from '../common/dto/page.input'

@Injectable()
export class DomainsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateDomainInput): Promise<Domain> {
    return this.prisma.$transaction(async (tx) => {
      const domain = await tx.domain.create({
        data: { ...input, slug: await this.uniqueSlug(slugify(input.name), tx) },
      })
      await tx.domainMember.create({
        data: { domainId: domain.id, userId, role: DomainRole.OWNER },
      })
      return domain
    })
  }

  /** Ne retourne que les domaines dont l'utilisateur est membre. */
  async listForUser(userId: string, page: PageInput): Promise<{ items: Domain[]; totalCount: number }> {
    const where: Prisma.DomainWhereInput = { members: { some: { userId } } }
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.domain.findMany({ where, orderBy: { createdAt: 'desc' }, take: page.limit, skip: page.offset }),
      this.prisma.domain.count({ where }),
    ])
    return { items, totalCount }
  }

  async findForUser(userId: string, domainId: string): Promise<Domain> {
    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, members: { some: { userId } } },
    })
    // Un domaine existant mais inaccessible renvoie NOT_FOUND et non FORBIDDEN :
    // distinguer les deux révélerait quels identifiants existent.
    if (!domain) throw new NotFoundException('Domaine introuvable')
    return domain
  }

  async update(userId: string, domainId: string, input: UpdateDomainInput): Promise<Domain> {
    await this.findForUser(userId, domainId)
    return this.prisma.domain.update({ where: { id: domainId }, data: input })
  }

  async remove(userId: string, domainId: string): Promise<boolean> {
    const member = await this.prisma.domainMember.findUnique({
      where: { userId_domainId: { userId, domainId } },
    })
    if (!member) throw new NotFoundException('Domaine introuvable')
    if (member.role !== DomainRole.OWNER) {
      throw new ForbiddenException('Seul un OWNER peut supprimer un domaine')
    }
    await this.prisma.domain.delete({ where: { id: domainId } })
    return true
  }

  private async uniqueSlug(base: string, tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; ; i++) {
      const candidate = i === 0 ? base : `${base}-${i}`
      if (!(await tx.domain.findUnique({ where: { slug: candidate } }))) return candidate
    }
  }
}
