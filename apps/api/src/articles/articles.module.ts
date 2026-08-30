import { Module } from '@nestjs/common'
import { ArticlesService } from './articles.service'
import { ArticlesResolver } from './articles.resolver'
import { CategoryResolver } from './category.resolver'
import { CategoriesService } from './categories.service'
import { CategoriesResolver } from './categories.resolver'
import { TagsService } from './tags.service'
import { TagsResolver } from './tags.resolver'
import { VersionsService } from './versions.service'

@Module({
  providers: [
    ArticlesService,
    ArticlesResolver,
    CategoryResolver,
    CategoriesService,
    CategoriesResolver,
    TagsService,
    TagsResolver,
    VersionsService,
  ],
  exports: [ArticlesService, VersionsService],
})
export class ArticlesModule {}
