import type { Options } from 'pino-http'
import { CORRELATION_HEADER } from '../middleware/correlation-id.middleware'

/**
 * Options `pino-http` partagées entre le bootstrap réel (AppModule) et les
 * tests d'intégration, qui doivent pouvoir exercer la configuration exacte
 * de redaction avec une destination de log différente (flux mémoire plutôt
 * que stdout) sans dupliquer ces réglages.
 */
export function createPinoHttpOptions(): Options {
  return {
    genReqId: (req) => req.headers[CORRELATION_HEADER] as string,
    redact: [
      'req.headers.cookie',
      'req.headers.authorization',
      // Le Set-Cookie de réponse contient les jetons de session en clair
      // (voir setSessionCookies dans auth/cookies.ts) : pino-http l'inclut
      // par défaut dans le log de fin de requête via le serializer `res`.
      // Vérifié concrètement dans errors.int-spec.ts (sans cette entrée,
      // le test de non-fuite échoue avec le JWT d'accès en clair).
      'res.headers["set-cookie"]',
      // NB : pino-http n'inclut PAS `req.body` par défaut (voir
      // pino-std-serializers), donc ce chemin ne correspond aujourd'hui à
      // rien dans la ligne de log — il ne protège rien tant qu'aucun code
      // ne journalise explicitement le corps de la requête. Conservé par
      // défense en profondeur pour le jour où ce serait le cas (cf. rapport
      // de la Task 16 pour le détail de cette vérification).
      'req.body.variables.input.password',
    ],
    transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  }
}
