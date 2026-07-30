# HDL WebIDE — Authentication (UI preview)

Standalone auth page, kept separate from the main `frontend`/`backend` apps
in this repo. **Nothing here is wired to a real backend yet** — this is a
UI/UX deliverable. Every auth flow is simulated locally so the full
experience (loading states, validation, success, errors) can be reviewed
end to end without any real credentials or provider setup.

```
log-in/
  frontend/   React + TypeScript + Tailwind + Framer Motion login page
  backend/    FastAPI skeleton -- routes exist, every handler is a 501 stub
```

## Running the frontend

```bash
cd log-in/frontend
npm install
cp .env.example .env.local   # optional -- nothing reads these yet
npm run dev
```

Opens at `http://localhost:5174`. Toggle the theme button top-right; try
both OAuth buttons (Google fails ~1 in 6 times on purpose, to show the
error toast without any special setup); submit the form with
`error@example.com` or `offline@example.com` as the email to see the two
inline-error copy variants, or any other valid email/8+ character password
to see the success state.

## Running the backend stub

```bash
cd log-in/backend
python -m venv venv && source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8010
```

`GET /health` returns `{"status": "ok"}`. Every route under `/api/v1/auth/*`
returns `501 Not Implemented` — see `app/api/auth.py`'s module doc for
exactly what each one needs to actually do.

## What "not wired up" means precisely

- `frontend/src/lib/mockAuth.ts` is the *entire* auth layer the UI talks to
  right now — every exported function has the same signature a real
  network call would have, but just `setTimeout`s and returns/throws
  locally. Swapping it for real `fetch()` calls against
  `VITE_API_BASE_URL` is the only change needed on the frontend side to go
  live, once the backend below actually implements something.
- `backend/app/api/auth.py` has the real route shapes and request/response
  schemas (`app/schemas/auth.py`) already defined, matching what the
  frontend sends/expects — but each handler just raises 501.
- `.env.example` in both folders name every config value a real
  implementation will need (OAuth client ids/secrets, JWT signing key,
  redirect URIs) so integrating later is "fill these in," not "figure out
  what's missing."

## Component architecture (frontend)

```
App
 └─ LoginPage
     ├─ ThemeToggle
     ├─ OAuthButtons        (Google / GitHub)
     ├─ Divider
     ├─ LoginForm
     │   ├─ FormField        (email)
     │   ├─ PasswordInput    (extends FormField)
     │   └─ ErrorAlert       (inline, dismissible)
     └─ Footer               (create account / privacy / terms)
 └─ ToastViewport            (global, bottom-right notifications)
```
