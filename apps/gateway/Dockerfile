FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
COPY apps/dashboard ./apps/dashboard
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @acr/dashboard run build
RUN pnpm --filter @acr/gateway... run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/gateway ./apps/gateway
COPY --from=build /app/apps/dashboard ./apps/dashboard
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "apps/gateway/dist/index.js"]
