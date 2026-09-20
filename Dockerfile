# create a bun base image
FROM oven/bun:1.4 AS base
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /usr/src/app

# install bun globally
FROM base AS installer
RUN bun install -g prisma
COPY ./package.json ./bun.lock ./

FROM installer AS prod
COPY ./prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc bun install --production && bun prisma generate --generator=client

FROM installer AS builder
COPY . .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc bun install && bun run build


# copy production dependencies and source code into final image
FROM base AS release
COPY --from=prod /usr/src/app/node_modules ./node_modules
COPY --from=builder ./usr/src/app/.env ./.env
COPY --from=builder ./usr/src/app/dist ./dist
COPY --from=builder ./usr/src/app/package.json ./package.json

# run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "start:prod" ]