import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import type { User } from '@prisma/client'

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const gqlCtx = GqlExecutionContext.create(ctx)
  return gqlCtx.getContext().req.user as User
})
