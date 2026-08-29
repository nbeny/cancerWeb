import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import type { Loaders } from '../dataloader/loaders'

/** Même motif que `CurrentUser` : lit les loaders posés dans le contexte GraphQL par `graphql.module.ts`. */
export const CurrentLoaders = createParamDecorator((_data: unknown, ctx: ExecutionContext): Loaders => {
  const gqlCtx = GqlExecutionContext.create(ctx)
  return gqlCtx.getContext().loaders as Loaders
})
