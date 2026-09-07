import { Injectable } from '@nestjs/common'
import { StepType } from '@prisma/client'
import { parse } from '../../markdown'
import { analyze } from '../../seo'
import type { SeoContext, SeoReportData } from '../../seo'
import type { PipelineRunWithSteps, StepContext, StepHandler, StepOutputs } from '../step-handler'
import { findCompletedStepOutput } from '../step-outputs'

export interface SeoStepInput {
  content: string
  context: SeoContext
}

/**
 * Étape déterministe : `parse` le contenu produit par `DRAFT`, puis délègue
 * la notation à `analyze` (`../../seo`). Aucune IA n'est appelée ici, ni
 * directement ni indirectement — cette classe ne prend d'ailleurs aucune
 * dépendance vers `AITaskService` ou `AIProvider` en constructeur, ce qui le
 * garantit structurellement. Un modèle ne peut pas être à la fois l'auteur
 * et le juge (voir la garantie éditoriale du design du Lot 2) : cette
 * étape est le juge, et reste indépendante de qui a écrit l'article.
 */
@Injectable()
export class SeoStepHandler implements StepHandler<SeoStepInput, SeoReportData> {
  readonly type = StepType.SEO

  buildInput(run: PipelineRunWithSteps, _previous: StepOutputs): SeoStepInput {
    if (!run.article) {
      throw new Error(`Étape SEO : le run ${run.id} n'a pas encore d'article associé, impossible d'analyser son contenu.`)
    }
    const content = findCompletedStepOutput<string>(run.steps, StepType.DRAFT, run.id)

    return {
      content,
      context: {
        seoTitle: run.article.seoTitle,
        metaDescription: run.article.metaDescription,
        focusKeyword: run.article.focusKeyword,
        slug: run.article.slug,
        language: run.domain.language,
      },
    }
  }

  async execute(input: SeoStepInput, _ctx: StepContext): Promise<SeoReportData> {
    return analyze(parse(input.content), input.context)
  }
}
