-- Ajoute Topic.rationale et Article.rationale (Task 3, Lot 2).
-- Écrite à la main (pas via `prisma migrate dev`) : ce dépôt a une colonne
-- générée (`Article.searchVector`, voir la migration
-- `20260825180147_article_search_vector`) volontairement absente de
-- schema.prisma, que la détection de dérive de `migrate dev` propose sinon
-- de supprimer. Appliquée via `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "rationale" TEXT;

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "rationale" TEXT;
