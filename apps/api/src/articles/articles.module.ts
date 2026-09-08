import { Module } from '@nestjs/common'
import { ArticlesService } from './articles.service'
import { ArticlesResolver } from './articles.resolver'
import { CategoryResolver } from './category.resolver'
import { CategoriesService } from './categories.service'
import { CategoriesResolver } from './categories.resolver'
import { TagsService } from './tags.service'
import { TagsResolver } from './tags.resolver'
import { VersionsService } from './versions.service'
import { RevalidationService } from './revalidation.service'

@Module({
  providers: [
    ArticlesService,
    // Non exporté : seul `ArticlesService` prévient le blog public, et le
    // garder encapsulé empêche qu'un autre module se mette à purger le cache
    // du front sans passer par l'entonnoir des transitions.
    RevalidationService,
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
