import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { GqlExceptionFilter } from '@nestjs/graphql'
import { GraphQLError } from 'graphql'
import { Prisma } from '@prisma/client'

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
}

@Catch()
export class AllExceptionsFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, _host: ArgumentsHost): GraphQLError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      return new GraphQLError(exception.message, {
        extensions: { code: CODE_BY_STATUS[status] ?? 'INTERNAL' },
      })
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Les codes Prisma sont traduits, jamais renvoyés tels quels.
      const code = exception.code === 'P2002' ? 'CONFLICT' : exception.code === 'P2025' ? 'NOT_FOUND' : 'INTERNAL'
      const message = code === 'CONFLICT' ? 'Cette valeur existe déjà' : 'Ressource introuvable'
      this.logger.warn(`Erreur Prisma interceptée : ${exception.code}`)
      return new GraphQLError(code === 'INTERNAL' ? 'Erreur interne' : message, { extensions: { code } })
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    return new GraphQLError('Erreur interne', { extensions: { code: 'INTERNAL' } })
  }
}
