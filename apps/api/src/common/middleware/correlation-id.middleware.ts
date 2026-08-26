import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const CORRELATION_HEADER = 'x-correlation-id'

// UUID (v1-v8, formats les plus courants pour un identifiant de
// corrélation généré côté client) ou chaîne alphanumérique/tiret courte.
// Un client ne doit pas pouvoir faire journaliser (et renvoyer dans la
// réponse) une valeur arbitraire : trop longue, avec des caractères de
// contrôle (fractionnement de log), ou reprenant délibérément l'id d'un
// autre utilisateur pour brouiller la corrélation des traces.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9-]{1,64}$/

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && (UUID_PATTERN.test(value) || SAFE_TOKEN_PATTERN.test(value))
}

/** Ne fait confiance à la valeur envoyée par le client que si elle a un
 * format raisonnable ; sinon en génère une neuve plutôt que de la rejeter
 * (un identifiant de corrélation mal formé ne doit jamais faire échouer
 * la requête).
 */
export function resolveCorrelationId(headerValue: unknown): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue
  return isValidCorrelationId(candidate) ? candidate : randomUUID()
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = resolveCorrelationId(req.headers[CORRELATION_HEADER])
    req.headers[CORRELATION_HEADER] = id
    res.setHeader(CORRELATION_HEADER, id)
    next()
  }
}
