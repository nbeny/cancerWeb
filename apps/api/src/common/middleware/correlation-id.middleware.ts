import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const CORRELATION_HEADER = 'x-correlation-id'

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers[CORRELATION_HEADER] as string | undefined) ?? randomUUID()
    req.headers[CORRELATION_HEADER] = id
    res.setHeader(CORRELATION_HEADER, id)
    next()
  }
}
