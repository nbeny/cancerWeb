import { Module } from '@nestjs/common'
import { SeoService } from './seo.service'
import { SeoResolver } from './seo.resolver'
import { ArticlesModule } from '../articles/articles.module'

@Module({
  imports: [ArticlesModule],
  providers: [SeoService, SeoResolver],
  exports: [SeoService],
})
export class SeoModule {}
