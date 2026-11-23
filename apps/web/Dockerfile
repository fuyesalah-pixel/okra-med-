FROM node:22-alpine AS deps
WORKDIR /app
# Pin to the version in package.json `packageManager`. `npm i -g pnpm` installs
# whatever is latest, which does not match pnpm@9.15.0 and can break installs.
RUN npm i -g pnpm@9.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
# Do not COPY packages/shared/package.json: packages/shared has no package.json yet
# (it is an empty placeholder). Referencing it made every image build fail at the
# deps stage, which is why deploys could never have succeeded.
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
# Each stage is a fresh image: a global install in `deps` does not exist here.
RUN npm i -g pnpm@9.15.0
# Copy the whole installed workspace: pnpm hoists node_modules per package, not
# just at the root, so copying /app/node_modules alone leaves apps/web unlinked.
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @okra-med/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next's standalone server binds to $HOSTNAME, and Docker sets HOSTNAME to the
# container id — so without this the app listens on the container IP only and
# every in-container probe (HEALTHCHECK, deploy.sh) gets ECONNREFUSED on
# localhost:3000 while port-mapped traffic still works. Classic silent-unhealthy.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
