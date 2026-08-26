// Bornes partagées pour Article, consommées directement par les décorateurs
// class-validator de apps/api/src/articles/article.types.ts (même motif que
// auth.ts / topic.ts : une seule source de vérité).
export const ARTICLE_TITLE_MIN_LENGTH = 3
export const ARTICLE_TITLE_MAX_LENGTH = 200
export const ARTICLE_CONTENT_MIN_LENGTH = 1
export const ARTICLE_CONTENT_MAX_LENGTH = 200_000
export const ARTICLE_EXCERPT_MAX_LENGTH = 500
export const ARTICLE_COVER_IMAGE_URL_MAX_LENGTH = 2048
export const ARTICLE_SEO_TITLE_MAX_LENGTH = 70
export const ARTICLE_META_DESCRIPTION_MAX_LENGTH = 160
export const ARTICLE_CANONICAL_URL_MAX_LENGTH = 2048
export const ARTICLE_FOCUS_KEYWORD_MAX_LENGTH = 100
export const ARTICLE_SECONDARY_KEYWORDS_MAX_SIZE = 20
