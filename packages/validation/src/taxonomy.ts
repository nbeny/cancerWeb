// Bornes partagées pour Category et Tag, consommées directement par les
// décorateurs class-validator de apps/api/src/articles/category.types.ts et
// tag.types.ts (même motif que auth.ts / topic.ts / article.ts : une seule
// source de vérité).
export const CATEGORY_NAME_MIN_LENGTH = 2
export const CATEGORY_NAME_MAX_LENGTH = 100
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 1000

export const TAG_NAME_MIN_LENGTH = 2
export const TAG_NAME_MAX_LENGTH = 50
