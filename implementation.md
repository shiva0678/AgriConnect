# AgriConnect Implementation Record

## 1. Project overview

AgriConnect is a full-stack marketplace prototype for farmer-to-buyer crop transactions. The project combines a React frontend with an Express API and a PostgreSQL-backed user/crop foundation.

This document records the current implementation status as of 2026-10-07 and is intended to reflect the actual codebase rather than older milestone notes.

## 2. Current technology stack

### Frontend

- React 19
- Vite 8
- React Router
- Axios for API requests
- TanStack Query hooks for async data access
- React Hook Form + Zod for validation
- Custom CSS-driven design system with glassmorphism-inspired styling

### Backend

- Node.js + Express 5
- PostgreSQL via `pg`
- JWT-based authentication with `jsonwebtoken`
- Password hashing with `bcrypt`
- Swagger UI + swagger-jsdoc
- Node test runner + Supertest for API verification

## 3. Verified backend implementation

The backend is currently functional for account, crop, marketplace, and buyer/farmer order workflows.

### Auth and profile

Implemented and verified features include:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- JWT validation through the auth middleware
- Protected role checks for buyer/farmer flows
- Safe user payload responses that exclude password hashes

### Health and API structure

- `GET /api/health`
- `GET /api/health/db`
- Swagger docs at `/api/docs` and `/api/docs.json`
- Global JSON not-found handler for unmatched routes
- Shared error middleware for consistent API responses

### Crop foundation

Database and route support are in place for crop workflows:

- PostgreSQL `users` table and `crops` table creation logic
- Crop indexes for farmer ownership and marketplace access
- `GET /api/crops` for public marketplace browsing
- `POST /api/crops` for authenticated farmer crop creation
- `GET /api/farmer/crops` for farmer inventory access
- `GET /api/crops/:id` for public crop details
- `PATCH /api/crops/:id` for farmer-owned crop updates
- `DELETE /api/crops/:id` for farmer-owned crop deletion

These routes enforce ownership and role-based access on the server side.

### Order workflows

The backend includes the Phase 4A order schema and the Phase 4B-4D buyer/farmer order flows:

- PostgreSQL `orders` table creation with foreign keys and validation constraints
- `POST /api/orders` for authenticated buyers only
- buyer-only authorization enforcement
- crop validation for UUID, existence, marketplace availability, and stock sufficiency
- server-side price snapshot from the crop record
- server-side total amount calculation
- pending order status assignment
- transactional stock reduction with rollback safety
- sold-out transition when quantity reaches zero
- consistent API JSON error responses for validation and business-conflict cases
- `GET /api/orders` for authenticated buyers to view their own order history
- buyer order pagination, status filtering, and newest-first ordering
- historical order price and total read from the stored order snapshot
- `GET /api/farmer/orders` for authenticated farmers to view only orders assigned to them
- farmer order pagination, status filtering, crop information, and safe buyer display names
- `PATCH /api/orders/:id/status` for a farmer to update only their own order status
- explicit transitions: pending to confirmed/cancelled, confirmed to shipped/cancelled, and shipped to delivered
- row-locked status updates that preserve order creation time, historical values, and crop stock

Status cancellation is supported only from pending or confirmed states through the farmer status endpoint; there is no separate cancellation API.

## 4. Current API surface

| Method              | Endpoint                 | Status           |
| ------------------- | ------------------------ | ---------------- |
| GET                 | `/api/health`            | Implemented      |
| GET                 | `/api/health/db`         | Implemented      |
| POST                | `/api/auth/register`     | Implemented      |
| POST                | `/api/auth/login`        | Implemented      |
| GET                 | `/api/auth/me`           | Implemented      |
| PATCH               | `/api/auth/me`           | Implemented      |
| GET                 | `/api/crops`             | Implemented      |
| POST                | `/api/crops`             | Implemented      |
| GET                 | `/api/farmer/crops`      | Implemented      |
| GET                 | `/api/crops/:id`         | Implemented      |
| PATCH               | `/api/crops/:id`         | Implemented      |
| DELETE              | `/api/crops/:id`         | Implemented      |
| POST                | `/api/orders`            | Implemented      |
| GET                 | `/api/orders`            | Implemented      |
| GET                 | `/api/farmer/orders`     | Implemented      |
| PATCH               | `/api/orders/:id/status` | Implemented      |
| GET                 | `/api/docs`              | Implemented      |
| GET                 | `/api/docs.json`         | Implemented      |
| Any unmatched route | —                        | JSON 404 handler |

## 5. Frontend status and key limitation

The frontend shell and role-based pages are present and compile successfully, but crop, marketplace, and order workflows are still not fully connected to live backend data.

### What is still mock-backed

The following flows remain demo data driven in the frontend:

- Farmer crop inventory list
- Add-crop form submission
- Buyer marketplace list and filters
- Buyer crop detail screens
- Buyer and farmer order history and order actions
- Static dashboard metrics and seeded product data

Relevant frontend files still show the mock pattern:

- `frontend/src/pages/farmer/AddCrop.jsx`
- `frontend/src/pages/farmer/FarmerCrops.jsx`
- `frontend/src/queries/crops.js`
- `frontend/src/data/farmerMockData.js`
- `frontend/src/data/buyerMockData.js`
- `frontend/src/services/api.js`

### Important reality check

The app is visually built as a full product, but not every screen is wired to the database-backed API yet. In the current implementation, a crop created in the farmer form will not appear in the UI unless the frontend form is connected to the real `POST /api/crops` flow and the inventory query is set to fetch the real farmer list instead of mock data.

This is the main source of the current mismatch: the backend is live and validated, but the frontend still uses mock/initial data in several user flows. No browser-based end-to-end verification of live frontend-to-backend flows has been performed.

## 6. Verification

The backend test suite and frontend build/lint checks were run in the current workspace.

Backend verification command:

```powershell
npm --prefix backend test -- --test-reporter=tap
```

Latest complete backend result:

- 47 tests total
- 47 passed
- 0 failed

The suite includes auth, crop CRUD, marketplace and detail, order schema and creation, buyer order history, and farmer order management/status transitions. It runs serially because the database-backed tests share PostgreSQL state.

Frontend verification commands:

```powershell
npm --prefix frontend run build
npm --prefix frontend run lint
```

The production build succeeded. Lint exited successfully with three warnings in `frontend/src/context/AuthContext.jsx`: an unused catch parameter, a Fast Refresh export warning, and a synchronous state update in an effect. `git diff --check` also passed. These checks do not replace browser-based end-to-end verification.

## 7. Current project priority

The immediate next priority is frontend-to-backend integration for crop and order actions, not further backend feature expansion. The backend supports buyer order history and farmer order management; the remaining gap is connecting the live UI to the live database-backed endpoints and verifying those flows in a browser.

## 8. Recommended next steps

1. Connect the farmer Add Crop form to `POST /api/crops`.
2. Replace mock farmer inventory data with `GET /api/farmer/crops`.
3. Replace marketplace mock data with `GET /api/crops`.
4. Correct the frontend API base URL to the active backend port instead of stale localhost assumptions.
5. Integrate buyer crop detail data from `GET /api/crops/:id`.
6. Add or update UI tests after the live data flow is connected.

## 9. Final note

The project is no longer in a pure mock-only phase for backend functionality, but the frontend still contains several demo-backed flows. The codebase is therefore partially live and partially demo-driven, and that distinction should be treated as a current implementation fact rather than an assumption.
