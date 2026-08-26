// Bornes partagées pour Topic, consommées directement par les décorateurs
// class-validator de apps/api/src/topics/topic.types.ts (voir auth.ts pour
// le même motif : une seule source de vérité, importée telle quelle côté
// API plutôt que dupliquée).
export const TOPIC_TITLE_MIN_LENGTH = 3
export const TOPIC_TITLE_MAX_LENGTH = 200
export const TOPIC_DESCRIPTION_MAX_LENGTH = 2000
export const TOPIC_SUGGESTED_ANGLE_MAX_LENGTH = 2000
export const TOPIC_KEYWORDS_MAX_SIZE = 30
export const TOPIC_DIFFICULTY_MIN = 1
export const TOPIC_DIFFICULTY_MAX = 10
export const TOPIC_INTEREST_MIN = 1
export const TOPIC_INTEREST_MAX = 10
