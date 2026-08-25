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
      // `exception.message` vaut littéralement "Bad Request Exception" pour
      // une BadRequestException levée par le ValidationPipe : le détail par
      // champ (les messages `class-validator`, ex. "Le mot de passe doit
      // faire au moins 12 caractères") vit dans `getResponse().message` et
      // n'était jamais lu. Les messages `class-validator` ne réinjectent
      // jamais la valeur saisie par le client (ils décrivent la contrainte
      // violée, pas la donnée), donc les exposer ici ne fait pas fuiter de
      // saisie utilisateur.
      const response = exception.getResponse()
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? [(response as { message: unknown }).message].flat().join(' · ')
          : exception.message
      return new GraphQLError(message, {
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
