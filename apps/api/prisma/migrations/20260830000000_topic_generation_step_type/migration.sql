-- Ajoute une valeur à l'enum StepType pour l'étape unique de génération de
-- sujets (Task 6, Lot 2) : voir la jsdoc dans schema.prisma sur StepType.
-- Écrite à la main (pas via `prisma migrate dev`) : ce dépôt a une colonne
-- générée (`Article.searchVector`, voir la migration
-- `20260825180147_article_search_vector`) volontairement absente de
-- schema.prisma, que la détection de dérive de `migrate dev` propose sinon
-- de supprimer.
ALTER TYPE "StepType" ADD VALUE 'TOPIC_GENERATION';
