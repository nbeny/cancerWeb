FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/graphql/package.json packages/graphql/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @cancerweb/api prisma:generate && pnpm --filter @cancerweb/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
# Copie sélective plutôt que `COPY --from=build /app/apps/api ./apps/api` :
# ce dernier embarquait aussi src/, test/ et apps/api/.env.test (le motif
# ".env" du .dockerignore ne matche qu'à la racine du contexte, pas en
# profondeur — voir .dockerignore) dans l'image d'exécution. Seuls dist/
# (code compilé), node_modules/ (résolution des modules + client Prisma
# généré), package.json (scripts "prisma:deploy" utilisés par le service
# `migrate`) et prisma/schema.prisma + prisma/migrations (nécessaires à
# `prisma migrate deploy`, PAS seed.ts qui n'est jamais exécuté par
# docker-compose) sont réellement utilisés à l'exécution.
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY --from=build /app/apps/api/prisma/migrations ./apps/api/prisma/migrations
# corepack résout la version de pnpm en remontant depuis le cwd vers le
# package.json le plus proche portant un champ "packageManager". Sans la
# racine du monorepo dans l'image, il retombe sur "latest" (téléchargé à la
# volée) au lieu du pnpm@9.15.0 épinglé — vérifié : ce pnpm plus récent
# ajoute une vérification de build scripts qui échoue en environnement non
# interactif. On copie donc le package.json racine (quelques centaines
# d'octets) pour que toute invocation de pnpm dans le conteneur (ex. le
# service `migrate`) utilise la version épinglée.
COPY --from=build /app/package.json ./package.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main"]
