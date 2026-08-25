import { resolve } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { parseEnv } from './config/env'
import { PrismaModule } from './prisma/prisma.module'

// Le monorepo n'a qu'un seul .env, à la racine (voir docker-compose.yml).
// __dirname pointe vers apps/api/src (ts-node) ou apps/api/dist (build) :
// remonter 3 niveaux atteint la racine du repo dans les deux cas.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnv,
      envFilePath: resolve(__dirname, '../../../.env'),
    }),
    PrismaModule,
  ],
})
export class AppModule {}
