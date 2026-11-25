# Store Ratings

A role-based store-rating platform built with React, Express, and PostgreSQL. Admins manage users and stores, customers submit or update one rating per store, and store owners can view their store's rating summary and reviewer list.

## Requirements

- Node.js 20+
- Docker (or a local PostgreSQL 16+ instance)

## Start locally

1. Start PostgreSQL: `docker compose up -d db`
2. Copy `backend/.env.example` to `backend/.env`; set `JWT_SECRET` to a random string of at least 32 characters.
3. Install dependencies: `npm install`
4. Create the schema: `psql "postgresql://ratings:ratings@localhost:5432/store_ratings" -f backend/db/schema.sql`
5. Create the first admin: `ADMIN_NAME="GoodStore Platform Admin" ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='ChangeMe123!' npm run seed:admin --workspace backend`
6. Start both apps: `npm run dev`

The frontend is at http://localhost:5173 and the API is at http://localhost:4000. The admin seed command reads `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_ADDRESS` from the environment, validates the values, and stores only a bcrypt password hash. Account names must be 20–60 characters.

## API

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- `PUT /api/auth/password`
- `GET /api/admin/summary`, `/api/admin/users`, `/api/admin/stores`
- `POST /api/admin/users`, `POST /api/admin/stores`
- `GET /api/stores`, `PUT /api/stores/:id/rating`
- `GET /api/owner/dashboard`

Admin listings accept `search`, `sort`, and `direction`; the user listing also accepts a `role` filter. All protected endpoints use bearer tokens.

## Validation

- `npm test` runs validation tests and end-to-end API workflows against an embedded PostgreSQL test database.
- `npm run build` type-checks and creates the production frontend bundle.
