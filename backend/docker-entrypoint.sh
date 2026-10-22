#!/bin/sh
# Apply pending database migrations, then run the container command
# (the API server by default, or e.g. `npm run seed:admin`).
set -e

npx prisma migrate deploy

exec "$@"
