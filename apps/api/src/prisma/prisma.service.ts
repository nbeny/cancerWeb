import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
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
