# Feynman Notes

A visual mind-mapping and task management application built with React, Express and MongoDB.

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

## Google and Facebook login

Copy the OAuth variables from `backend/.env.example` into your private `backend/.env` and configure:

- `AUTH_SESSION_SECRET`: a random secret of at least 32 characters.
- `APP_BASE_URL`: the public backend origin, without a trailing slash.
- `FRONTEND_URL`: the frontend origin used after login.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`.

Register these exact callback URLs in the provider consoles:

- `{APP_BASE_URL}/api/auth/google/callback`
- `{APP_BASE_URL}/api/auth/facebook/callback`

Providers without credentials remain disabled in the login screen. OAuth secrets must never use the `VITE_` prefix or be committed to Git.

## Contact

- Dương Tấn Hưng — AI Engineer
- Email: [duongtanhung24@gmail.com](mailto:duongtanhung24@gmail.com)
- Phone: [0905 559 946](tel:+84905559946)
- GitHub: [hungdata](https://github.com/hungdata)
