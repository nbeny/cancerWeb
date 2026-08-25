import { ExecutionContext, Injectable } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Request, Response } from 'express'

// Le ThrottlerGuard par défaut lit `req`/`res` via `context.switchToHttp()`,
// qui est vide en GraphQL (le contexte d'exécution est de type `graphql`,
// pas `http`) : sans cette surcharge il compterait toutes les requêtes sur
// une même clé indéfinie et finirait par bloquer tout le monde.
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext): { req: Request; res: Response } {
    const gqlCtx = GqlExecutionContext.create(context).getContext()
    return { req: gqlCtx.req, res: gqlCtx.res }
  }
}
