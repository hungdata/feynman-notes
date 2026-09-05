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

## macOS desktop app

The Electron desktop client opens the production service in a sandboxed native window. It does not bundle backend secrets or database credentials, and its login cookie is persisted in Electron's application data directory. Google sign-in opens in the Mac's default browser and returns to the app through a short-lived localhost callback, so OAuth is never run in a blocked embedded browser.

```bash
npm install --prefix desktop
npm run desktop:dev
```

Build an unsigned Apple Silicon installer on macOS:

```bash
npm run desktop:build:mac
```

Build for an Intel Mac instead:

```bash
npm run desktop:build:mac:intel
```

Artifacts are written to `desktop/dist`. Public distribution outside the Mac App Store requires Apple Developer signing and notarization; local unsigned builds can be opened through Finder's **Open** context menu.

## Google login and guest trial

Copy the OAuth variables from `backend/.env.example` into your private `backend/.env` and configure:

- `AUTH_SESSION_SECRET`: a random secret of at least 32 characters.
- `APP_BASE_URL`: the public backend origin, without a trailing slash.
- `FRONTEND_URL`: the frontend origin used after login.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Register these exact callback URLs in the provider consoles:

- `{APP_BASE_URL}/api/auth/google/callback`

Google login remains disabled until its credentials are configured. Guest trial sessions use a signed, HttpOnly cookie and receive an isolated owner ID, so their mind maps, tasks, images and AI conversations cannot mix with another user. OAuth secrets must never use the `VITE_` prefix or be committed to Git.

## Contact

- Dương Tấn Hưng — AI Engineer
- Email: [duongtanhung24@gmail.com](mailto:duongtanhung24@gmail.com)
- Phone: [0905 559 946](tel:+84905559946)
- GitHub: [hungdata](https://github.com/hungdata)
