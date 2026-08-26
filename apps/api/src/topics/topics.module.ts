import { Module } from '@nestjs/common'
import { TopicsService } from './topics.service'
import { TopicsResolver } from './topics.resolver'

@Module({ providers: [TopicsService, TopicsResolver], exports: [TopicsService] })
export class TopicsModule {}
