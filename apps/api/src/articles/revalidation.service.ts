import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Env } from '../config/env'

/**
 * Chemin du webhook côté Next.js. `apps/web/src/proxy.ts` exclut `api` de son
 * matcher : cette route n'est donc JAMAIS réécrite vers `/blog/<slug>`, quel
 * que soit l'hôte utilisé pour l'atteindre.
 */
const CHEMIN_WEBHOOK = '/api/revalidate'

/**
 * En-tête portant le secret partagé. Un en-tête plutôt qu'un paramètre
 * d'URL : une chaîne de requête finit dans les journaux d'accès de Caddy et
 * dans l'historique de n'importe quel outil de diagnostic.
 */
export const REVALIDATE_SECRET_HEADER = 'x-revalidate-secret'

/**
 * Délai maximal accordé au front. L'appel est ATTENDU par la mutation qui
 * publie (voir `ArticlesService.transitionArticle`), donc ce délai est aussi
 * le pire allongement du temps de réponse d'une publication. Trois secondes :
 * assez pour un aller-retour sur le réseau du conteneur même sous charge,
 * assez court pour qu'un front figé ne bloque pas l'éditeur.
 */
export const REVALIDATION_TIMEOUT_MS = 3_000

/**
 * Prévient le front Next.js qu'un article public a changé, pour qu'il purge
 * les entrées de cache correspondantes.
 *
 * Ce service ne connaît PAS le format des étiquettes de cache : il n'envoie
 * que l'identité de ce qui a changé (`domainSlug`, `articleSlug`) et laisse
 * le route handler côté web construire les étiquettes avec ses propres
 * fabriques (`etiquetteArticle`, `etiquetteSommaire`, `etiquetteDomaine`).
 * C'est délibéré : dupliquer ici le format `article-public:<domaine>:<slug>`
 * créerait un contrat implicite entre deux applications qui ne partagent
 * aucun module, et une divergence ne produirait aucune erreur — juste un
 * blog figé, sans le moindre signal.
 *
 * Séparé d'`ArticlesService` plutôt qu'inséré dedans : c'est le seul appel
 * réseau sortant de l'API, et l'isoler permet de le remplacer par un double
 * dans les tests (unitaires comme d'intégration) sans avoir à intercepter
 * `fetch` globalement.
 *
 * Lève en cas d'échec, volontairement : c'est un client HTTP, il dit la
 * vérité sur ce qui s'est passé. La politique « une publication ne doit
 * jamais échouer parce que le front ne répond pas » appartient à l'appelant,
 * qui seul sait ce qu'il est en train de faire (voir
 * `ArticlesService.notifyPublicBlog`).
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name)

  constructor(private readonly config: ConfigService<Env, true>) {}

  async notifyArticleChange(domainSlug: string, articleSlug: string): Promise<void> {
    const baseUrl = this.config.get('WEB_INTERNAL_URL', { infer: true })
    const secret = this.config.get('REVALIDATE_SECRET', { infer: true })

    // Configuration incomplète : on ne tente rien, mais on le dit. Un
    // `return` muet transformerait une variable d'environnement oubliée en
    // blog figé sans aucune trace — exactement le scénario contre lequel le
    // plancher de revalidation d'une heure sert de filet côté web.
    if (!baseUrl || !secret) {
      this.logger.warn(
        `Revalidation ignorée pour ${domainSlug}/${articleSlug} : WEB_INTERNAL_URL et/ou REVALIDATE_SECRET ne sont pas configurés`,
      )
      return
    }

    const response = await fetch(new URL(CHEMIN_WEBHOOK, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [REVALIDATE_SECRET_HEADER]: secret },
      body: JSON.stringify({ domainSlug, articleSlug }),
      // Sans ce signal, une connexion établie mais sans réponse ferait
      // attendre la mutation jusqu'au délai par défaut d'undici (aucune
      // limite de bout en bout), donc potentiellement indéfiniment.
      signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
    })

    // Le corps n'apporte rien que le code de statut ne dise déjà, mais il est
    // explicitement abandonné : `fetch` d'undici ne rend la connexion au pool
    // qu'une fois le flux consommé ou annulé — le laisser ouvert la garderait
    // immobilisée jusqu'au ramasse-miettes. `?.` parce qu'une réponse sans
    // corps (204) a un `body` nul.
    await response.body?.cancel()

    if (!response.ok) {
      throw new Error(`Le webhook de revalidation a répondu ${response.status}`)
    }
  }
}
