// Bornes partagées pour la génération de sujets par IA (Task 6, Lot 2),
// consommées par le décorateur class-validator de
// `apps/api/src/pipeline/pipeline.types.ts` (`GenerateTopicsInput`) — même
// motif qu'ailleurs dans ce paquet (voir topic.ts) : une seule source de
// vérité, jamais dupliquée côté API.
//
// 1 : générer zéro sujet n'a pas de sens (autant ne pas appeler la mutation).
// 20 : un appel IA (CLI, ~1 min en pratique) reste dans une durée
// raisonnable pour un utilisateur qui suit sa progression dans l'interface ;
// au-delà, mieux vaut plusieurs appels plus courts qu'un unique lot qui
// bloquerait la file pendant plusieurs minutes (concurrence à 1, voir
// `PipelineProcessor`).
export const GENERATE_TOPICS_COUNT_MIN = 1
export const GENERATE_TOPICS_COUNT_MAX = 20
