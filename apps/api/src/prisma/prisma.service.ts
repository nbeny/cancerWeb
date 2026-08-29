import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient, Prisma } from '@prisma/client'

/**
 * `log: [{ emit: 'event', level: 'query' }]` active `$on('query', ...)` —
 * requis par `n-plus-one.int-spec.ts` pour compter les requêtes SQL
 * réellement émises pendant une requête GraphQL. Le second paramètre
 * générique (`'query'`) est ce qui donne à `$on` sa signature typée pour cet
 * événement ; sans lui, `$on('query', ...)` compile mais n'est jamais émis.
 */
@Injectable()
export class PrismaService extends PrismaClient<Prisma.PrismaClientOptions, 'query'> implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }

  /** Vide toutes les tables. Réservé aux tests d'intégration. */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll est interdit hors environnement de test')
    }
    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
    if (list) await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
  }
}
