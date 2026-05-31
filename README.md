# Reframe

Reframe is a React + Express review app for animation teams. Animators can upload an MP4, get a shareable review link, collect timestamped notes and frame annotations, translate vague feedback into actionable creative direction, and export a clean PDF report.

## Stack

- React + Vite in `client/`
- Express in `server/`
- Supabase Storage for MP4 hosting
- Supabase Postgres for project, note, and annotation records
- Fabric.js for the annotation overlay
- Tailwind CSS for the dark review UI
- OpenAI GPT-4o for AI note translation
- Stripe Checkout for the `$18/month` Studio subscription
- jsPDF for client-side report export

## Environment

Copy `.env.example` to `.env` and fill in:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `APP_BASE_URL`
- `MONTHLY_PRICE_USD`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

OpenAI calls are server-side only. Do not expose an OpenAI key with a `VITE_` prefix.

Create a recurring Stripe Price for `$18/month`, then set `STRIPE_PRICE_ID` to
that Price ID. The app uses Stripe Checkout Sessions in subscription mode.

The client no longer needs the Supabase browser SDK for playback. The server resolves and returns the public video URL directly.

## Database Setup

Run these SQL files in the Supabase SQL editor:

1. [supabase/translate_projects.sql](/Users/abiolabatiste/Documents/New%20project/supabase/translate_projects.sql)
2. [supabase/video_annotations.sql](/Users/abiolabatiste/Documents/New%20project/supabase/video_annotations.sql)
3. [supabase/timestamped_notes.sql](/Users/abiolabatiste/Documents/New%20project/supabase/timestamped_notes.sql)
4. [supabase/saas_foundation.sql](/Users/abiolabatiste/Documents/New%20project/supabase/saas_foundation.sql)

The SaaS foundation adds workspace, client, subscription, project version,
approval status, invite, task, and activity tables. Run it before using the new
client portal metadata fields in production.

## Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:3001`

## Features

- Upload an MP4 and create a named project with a shareable review URL
- Generate a separate animator owner workspace URL for report export, AI translation, and annotation cleanup
- Start a `$18/month` Studio subscription through Stripe Checkout
- Store client names, client emails, brand names, accent colors, review deadlines, approval statuses, and version labels
- Mark reviews as changes requested, approved, or final delivered
- Load a clean viewer page with Supabase-backed playback
- Draw pen, circle, and arrow annotations while the video is paused
- Save timestamped notes while paused or playing
- Translate each note through an owner-only server-side OpenAI route and store the JSON response in `ai_translation`
- Export a PDF report from the upload view with notes, AI summaries/actions, and annotation timestamps

## Testing

Run the full test suite:

```bash
npm test
```

Build the client:

```bash
npm run build
```

## Render Demo Deployment

This repo includes `render.yaml` for deploying the whole app as one Render Web
Service on the free plan. The build step creates the React app in `client/dist`,
then the Express server serves that frontend and the API from the same URL.

1. Push this repo to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Connect the GitHub repo and let Render detect `render.yaml`.
4. Fill in the required environment variables when Render asks:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `APP_BASE_URL`

Set `APP_BASE_URL` to the final Render URL, for example:

```bash
https://reframe-demo.onrender.com
```

Optional Stripe variables can stay blank for a demo:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

Render settings if you create the service manually instead of using Blueprint:

```bash
Build Command: npm install && npm run build
Start Command: npm run start
Health Check Path: /api/config
```

Render free web services are good for demos, but they can have free-tier
limitations such as slower cold starts.
