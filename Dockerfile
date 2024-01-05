# Build stage
FROM node:18.12.1-alpine3.17 AS build
WORKDIR /build

RUN apk update && apk add openssl1.1-compat

# Install modules with dev dependencies
COPY package.json yarn.lock /build/
RUN yarn install --froezn-lockfile

# Build
COPY . /build
RUN yarn db:generate
RUN yarn build

# Regenerate node modules as production
RUN rm -rf ./node_modules
RUN yarn install --production --frozen-lockfile

# Bundle stage
FROM node:18.12.1-alpine3.17 AS production

WORKDIR /app

# Copy from build stage
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/yarn.lock /build/package.json ./
COPY --from=build /build/public ./public
COPY --from=build /build/prisma ./prisma
COPY --from=build /build/.next ./.next

# Start script
USER node
EXPOSE 3000
CMD ["yarn", "start:prod"]