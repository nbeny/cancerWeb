import { Module } from '@nestjs/common'
import { ArticlesService } from './articles.service'
import { ArticlesResolver } from './articles.resolver'
import { CategoryResolver } from './category.resolver'
import { VersionsService } from './versions.service'

@Module({
  providers: [ArticlesService, ArticlesResolver, CategoryResolver, VersionsService],
  exports: [ArticlesService, VersionsService],
})
export class ArticlesModule {}
