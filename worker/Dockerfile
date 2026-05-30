FROM node:20-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY worker/package.json worker/package.json

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY worker/ worker/

RUN pnpm --filter @billzo/shared build
RUN pnpm --filter billzo-worker build
RUN pnpm --filter billzo-worker lint:mutations

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/worker/dist /app/worker/dist
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/worker/package.json /app/worker/package.json
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=build /app/worker/node_modules /app/worker/node_modules

EXPOSE 10000

WORKDIR /app/worker
CMD ["node", "dist/index.js"]
