# AgriConnect

AgriConnect is an AI-powered farmer-to-buyer marketplace with price analytics.

## Project Structure

- `frontend/`: React application built with Vite and Tailwind CSS.
- `backend/`: Node.js and Express API service.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL credentials when database features are added

## Run The Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite development server prints its local URL, normally `http://localhost:5173`.

## Run The Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

The API listens on `http://localhost:5000` by default. Check `GET /api/health` for the starter health response.

The current frontend includes the public Home, Login, and Register pages, the static farmer workspace, and the static buyer workspace at `/buyer/dashboard`, `/buyer/marketplace`, `/buyer/crop/:id`, `/buyer/orders`, and `/buyer/profile`. The backend has a clean Express architecture with PostgreSQL connectivity, health routing, error handling, and an initial users table. Authentication, marketplace persistence, and analytics will be added in later milestones.

## Configure Supabase PostgreSQL

Copy the environment template inside `backend/`:

```powershell
cd backend
copy .env.example .env
```

Set `DATABASE_URL` in `backend/.env` to the PostgreSQL URI from **Supabase Dashboard → Project Settings → Database → Connection string**. Use the Session Pooler URI when running from a local development machine if Supabase recommends it for your project.

```env
PORT=5000
DATABASE_URL=your_private_supabase_postgresql_uri
JWT_SECRET=
```

Do not paste credentials into source files, documentation, screenshots, or Git. The root `.gitignore` excludes `backend/.env`. The `.env.example` file contains variable names only and must not contain real credentials.

The backend tests the connection during startup and initializes the `users` table. Check `GET http://localhost:5000/api/health/db` after starting the server.
