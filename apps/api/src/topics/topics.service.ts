import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Topic, TopicStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTopicInput, UpdateTopicInput } from './topic.types'
import { PageInput } from '../common/dto/page.input'

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, domainId: string, input: CreateTopicInput): Promise<Topic> {
    await this.requireMember(userId, domainId)
    return this.prisma.topic.create({ data: { ...input, domainId } })
  }

  /** Ne retourne que les sujets du domaine dont l'utilisateur est membre. */
  async listForDomain(
    userId: string,
    domainId: string,
    status: TopicStatus | undefined,
    page: PageInput,
  ): Promise<{ items: Topic[]; totalCount: number }> {
    await this.requireMember(userId, domainId)
    const where: Prisma.TopicWhereInput = { domainId, ...(status ? { status } : {}) }
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.topic.findMany({ where, orderBy: { createdAt: 'desc' }, take: page.limit, skip: page.offset }),
      this.prisma.topic.count({ where }),
    ])
    return { items, totalCount }
  }

  async findForUser(userId: string, domainId: string, topicId: string): Promise<Topic> {
    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, domainId, domain: { members: { some: { userId } } } },
    })
    // Un sujet existant mais inaccessible (autre domaine, non-membre) renvoie
    // NOT_FOUND et non FORBIDDEN : distinguer les deux révélerait l'existence
    // de l'identifiant.
    if (!topic) throw new NotFoundException('Sujet introuvable')
    return topic
  }

  async update(userId: string, domainId: string, topicId: string, input: UpdateTopicInput): Promise<Topic> {
    await this.findForUser(userId, domainId, topicId)
    return this.prisma.topic.update({ where: { id: topicId }, data: input })
  }

  async remove(userId: string, domainId: string, topicId: string): Promise<boolean> {
    await this.findForUser(userId, domainId, topicId)
    await this.prisma.topic.delete({ where: { id: topicId } })
    return true
  }

  /**
   * IDEA -> SELECTED uniquement. `CONVERTED` n'est jamais atteignable ici ni
   * par aucune autre mutation de ce module : seule `ArticlesService.create`
   * (Task 6), en créant un article depuis ce sujet, y mène.
   */
  async select(userId: string, domainId: string, topicId: string): Promise<Topic> {
    const topic = await this.findForUser(userId, domainId, topicId)
    if (topic.status !== TopicStatus.IDEA) {
      throw new ConflictException(`Transition impossible : le sujet est en statut ${topic.status}`)
    }
    return this.prisma.topic.update({ where: { id: topicId }, data: { status: TopicStatus.SELECTED } })
  }

  /** IDEA ou SELECTED -> REJECTED. Un sujet déjà REJECTED ou CONVERTED ne peut plus transiter. */
  async reject(userId: string, domainId: string, topicId: string): Promise<Topic> {
    const topic = await this.findForUser(userId, domainId, topicId)
    if (topic.status !== TopicStatus.IDEA && topic.status !== TopicStatus.SELECTED) {
      throw new ConflictException(`Transition impossible : le sujet est en statut ${topic.status}`)
    }
    return this.prisma.topic.update({ where: { id: topicId }, data: { status: TopicStatus.REJECTED } })
  }

  /**
   * Vérifie l'appartenance au domaine indépendamment du guard : un appel
   * depuis un autre chemin (job interne, futur script) ne doit pas pouvoir
   * contourner l'isolation par domaine simplement en sautant le resolver.
   */
  private async requireMember(userId: string, domainId: string): Promise<void> {
    const member = await this.prisma.domainMember.findUnique({
      where: { userId_domainId: { userId, domainId } },
    })
    if (!member) throw new NotFoundException('Domaine introuvable')
  }
}
