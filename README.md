# TodoX

A full-stack task manager built with React, Express and MongoDB.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and set a new MongoDB connection string.
2. Install dependencies with `npm ci --prefix backend` and `npm ci --prefix frontend`.
3. Run `npm run dev:backend` and `npm run dev:frontend` in separate terminals.
4. Open `http://localhost:5173`.

The Vite development server proxies `/api` requests to port `5051`.

## Production deployment

Deploy the repository as one Node web service.

- Build command: `npm run build`
- Start command: `npm start`
- Required environment variable: `MONGODB_CONNECTION_STRING`
- Recommended environment variables: `NODE_ENV=production` and `PORT` if required by the host

The Express server serves both the API and the generated React application in production. Do not commit `.env` files or place database credentials in variables prefixed with `VITE_`, because Vite variables are embedded in browser code.

Before deploying, create a restricted MongoDB database user, rotate any credential that has previously been committed, and restrict Atlas network access as narrowly as your hosting platform allows.
