import { Module } from '@nestjs/common'
import { DomainsService } from './domains.service'
import { DomainsResolver } from './domains.resolver'

@Module({ providers: [DomainsService, DomainsResolver], exports: [DomainsService] })
export class DomainsModule {}
