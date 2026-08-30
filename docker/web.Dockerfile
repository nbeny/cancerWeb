FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/graphql/package.json packages/graphql/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
# @cancerweb/graphql et @cancerweb/validation ont leurs propres dépendances
# (graphql, graphql-request, zod...) : pnpm les installe sous forme de liens
# symboliques dans le node_modules de CHAQUE paquet, pas seulement à la
# racine. Sans ce COPY, `tsc` échoue à résoudre ces modules pendant le
# build Next.js (vérifié : build cassé sans ces deux lignes).
COPY --from=deps /app/packages/graphql/node_modules ./packages/graphql/node_modules
COPY --from=deps /app/packages/validation/node_modules ./packages/validation/node_modules
COPY . .
RUN pnpm --filter @cancerweb/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
# packages/graphql reste en TypeScript brut (package.json "main":
# "./src/generated.ts") : node_modules/@cancerweb/graphql n'est qu'un lien
# symbolique pnpm vers ce répertoire. `transpilePackages` fait transpiler et
# inliner son code dans les bundles .next par webpack au build, mais le lien
# du workspace doit rester résoluble au démarrage (ex. résolution de module
# par Node en dehors des chemins bundlés). On ne copie que le strict
# nécessaire (package.json + src), pas node_modules ni packages/config
# (outillage de dev uniquement), pour ne pas alourdir l'image pour rien.
COPY --from=build /app/packages/graphql/package.json ./packages/graphql/package.json
COPY --from=build /app/packages/graphql/src ./packages/graphql/src
# packages/validation publie désormais un vrai build ("main"/"types" pointent
# vers dist/, voir packages/validation/package.json) : c'est dist/ qu'il faut
# copier ici, pas src/, sous peine de lien symbolique résoluble mais menant à
# un package.json dont le "main" ne trouve rien au démarrage.
COPY --from=build /app/packages/validation/package.json ./packages/validation/package.json
COPY --from=build /app/packages/validation/dist ./packages/validation/dist
# Le CMD lance `pnpm --filter @cancerweb/web start` : pnpm doit retrouver la
# racine du workspace (pnpm-workspace.yaml) pour résoudre le filtre, et
# corepack doit trouver le package.json racine pour épingler la bonne
# version de pnpm (voir commentaire équivalent dans api.Dockerfile — sans
# lui, corepack retombe sur "latest" et échoue en environnement non
# interactif).
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3001
CMD ["pnpm", "--filter", "@cancerweb/web", "start"]
