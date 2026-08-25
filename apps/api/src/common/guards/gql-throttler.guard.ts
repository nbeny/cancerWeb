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

  // Par défaut, ThrottlerGuard suit uniquement `req.ip`. Avec `trust proxy`
  // correctement configuré (voir main.ts), `req.ip` reflète bien le client
  // final, mais un compte compromis pourrait pulvériser des requêtes depuis
  // de nombreuses IP pour contourner une limite purement par adresse.
  // Quand l'utilisateur est authentifié (req.user posé par GqlAuthGuard,
  // qui s'exécute avant ce guard dans la liste des APP_GUARD), on suit son
  // identité plutôt que son IP ; sinon on retombe sur l'IP.
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`
  }
}
