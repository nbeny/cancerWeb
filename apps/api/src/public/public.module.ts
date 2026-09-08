import { Module } from '@nestjs/common'
import { PublicService } from './public.service'
import { PublicResolver } from './public.resolver'

// Pas d'`imports` : `PrismaModule` est `@Global()` (voir
// `prisma/prisma.module.ts`), comme pour `DomainsModule` et `ArticlesModule`.
// Rien n'est exporté non plus — `PublicService` ne sert qu'au blog public, et
// le garder encapsulé évite qu'un module du back-office s'en serve un jour
// comme raccourci de lecture en croyant y gagner un contrôle d'accès.
@Module({ providers: [PublicService, PublicResolver] })
export class PublicModule {}
