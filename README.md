# AgriConnect

AgriConnect is an AI-powered farmer-to-buyer marketplace with price analytics.

## Project Structure

- `frontend/`: React application built with Vite and Tailwind CSS.
- `backend/`: Node.js and Express API service.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Supabase project credentials when database features are added

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

This milestone contains only the project foundation and a frontend placeholder. Authentication, database tables, marketplace pages, and analytics will be added in later milestones.
