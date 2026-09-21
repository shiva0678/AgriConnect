# AgriConnect

AgriConnect is a farmer-to-buyer marketplace platform designed to connect agricultural producers and buyers in a simpler, more transparent workflow. Phase 1 focuses on the authenticated user journey, dashboard entry points, and a working frontend-backend integration without adding crop/order workflows, analytics, or AI features.

## Project overview

This first phase covers the foundation of the product:

- public marketing and landing pages
- login and registration screens
- backend authentication API
- PostgreSQL persistence for users
- JWT-based protected routes
- farmer and buyer dashboard role separation
- role-based route protection
- secure password handling with bcrypt
- logout state reset and session restore on refresh

## Features completed in Phase 1

### Frontend

- landing page and public navigation
- login page with validation and loading states
- register page with validation and duplicate-check handling
- farmer dashboard pages
- buyer dashboard pages
- protected route guarding
- role-based route restriction
- logout and session persistence
- responsive dashboard layout

### Backend

- Express API setup
- PostgreSQL connection and health check
- Supabase database configuration
- initial users table creation
- user registration API
- login API with JWT issuance
- protected authenticated user route
- JWT verification middleware
- bcrypt password hashing
- duplicate email handling
- safe user responses without password leakage

## Tech stack

### Frontend

- React
- Vite
- React Router
- Axios
- CSS-based layouts with responsive dashboard styling

### Backend

- Node.js
- Express
- PostgreSQL via pg
- Supabase
- bcrypt
- JWT
- dotenv

## Project structure

```text
AgriConnect/
├─ backend/
│  ├─ config/
│  ├─ controllers/
│  ├─ middleware/
│  ├─ models/
│  ├─ routes/
│  ├─ tests/
│  ├─ utils/
│  ├─ .env.example
│  ├─ .env
│  ├─ package.json
│  ├─ server.js
│  └─ swagger.js
├─ frontend/
│  ├─ src/
│  ├─ package.json
│  ├─ vite.config.js
│  └─ index.html
├─ .gitignore
├─ README.md
├─ implementation.md
└─ .env.example
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The UI runs on the Vite dev server, usually on `http://localhost:5173`.

## Backend setup

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

The backend normally runs on `http://localhost:5000`.

## Supabase setup instructions

1. Create a Supabase project.
2. Open the project dashboard.
3. Go to Project Settings → Database.
4. Copy the PostgreSQL connection string.
5. Add it to `backend/.env`.

Example:

```env
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/postgres
JWT_SECRET=your_secure_jwt_secret
```

Important:

- never commit `.env`
- keep secrets out of source control
- use `.env.example` as the safe template only

## Environment variables

```env
PORT=5000
DATABASE_URL=your_private_supabase_postgresql_uri
JWT_SECRET=your_generated_jwt_secret
```

## API endpoints

### Health

```http
GET /api/health
GET /api/health/db
```

### Authentication

```http
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me
```

### Auth request examples

Register:

```json
{
  "name": "Test Farmer",
  "email": "farmer@example.com",
  "phone": "9876543210",
  "password": "password123",
  "role": "farmer"
}
```

Login:

```json
{
  "email": "farmer@example.com",
  "password": "password123"
}
```

Protected route header:

```http
Authorization: Bearer <jwt_token>
```

## How to run the project

### Start backend

```bash
cd backend
npm start
```

### Start frontend

```bash
cd frontend
npm run dev
```

### Swagger docs

The API docs are available at:

```text
http://localhost:5000/api/docs
```

## Phase 1 limitations

The following items are intentionally not included in this phase and are deferred to later milestones:

- AI chatbot
- analytics dashboard
- wastage alerts
- fair-price indicator
- full crop CRUD
- full order CRUD
- real marketplace pricing engine
- RAG and LLM integration
- government scheme matching

## Future Phase 2/3 features

Planned next milestones include:

- crop management flows
- buyer marketplace interactions
- order workflows
- farm data and lifecycle management
- recommendations and pricing intelligence
- AI-powered buyer/seller assistance
- expanded analytics and reporting

## Notes

- user passwords are stored as bcrypt hashes, never plaintext
- `.env` is ignored by Git
- `.env.example` exists at `backend/.env.example`
- the project currently focuses on the authentication and protected dashboard foundation only
