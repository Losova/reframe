# Translate

Translate is a React + Express web app for animation teams to upload MP4 dailies and share them with a clean playback link.

## Stack

- React + Vite in `client/`
- Express in `server/`
- Supabase Storage for video hosting
- Supabase Postgres for timestamped annotation records
- Fabric.js for the video annotation overlay
- Tailwind CSS for styling

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `VITE_OPENAI_API_KEY`
3. Install dependencies:

```bash
npm install
```

4. Create the annotations table in Supabase by running [supabase/video_annotations.sql](/Users/abiolabatiste/Documents/New%20project/supabase/video_annotations.sql) in the Supabase SQL editor.
5. Create the timestamped notes table in Supabase by running [supabase/timestamped_notes.sql](/Users/abiolabatiste/Documents/New%20project/supabase/timestamped_notes.sql) in the Supabase SQL editor.

6. Start the app:

```bash
npm run dev
```

The client runs on `http://localhost:5173` and the API runs on `http://localhost:3001`.

## How It Works

- The Express backend accepts an MP4 upload.
- The server creates a unique share ID and uploads the file into a public Supabase Storage bucket named `translate-videos`.
- The upload response returns a shareable route like `/v/<share-id>`.
- The React viewer fetches the video metadata from the backend and resolves a public playback URL using the Supabase publishable key.
- When the video is paused, a Fabric.js canvas enables pen, circle, and arrow annotations.
- Each annotation is saved to Supabase with the current video timestamp, a timestamp bucket, and the current review session ID.
- During playback, annotations tied to the current timestamp bucket are redrawn on the overlay automatically.
- The review sidebar also stores timestamped text notes in Supabase and lets viewers jump back to any note by clicking its `MM:SS` badge.
- Each note can be translated with GPT-4o into a clearer creative-direction card, and that AI output is saved back into Supabase as `ai_translation`.

## Production

Build the frontend:

```bash
npm run build
```

Then start the server:

```bash
npm start
```

When `client/dist` exists, the Express server will serve the built frontend and support direct navigation to share URLs.
