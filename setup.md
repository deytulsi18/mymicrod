# Airtable and Netlify setup

Diary entries are stored in Airtable through a Netlify serverless function. The Airtable personal access token is only used by the function and is never exposed to the browser.

## 1. Create the Airtable table

Create a table named `Diary` (or choose another name for `AIRTABLE_TABLE_NAME`) with these fields:

| Field | Airtable type |
| --- | --- |
| `ID` | Single line text |
| `Date` | Single line text |
| `Text` | Long text |
| `CreatedAt` | Date/time or single line text |
| `UpdatedAt` | Date/time or single line text |

The `ID` field must be unique for every entry. Grant the Airtable personal access token read and write access to the base.

## 2. Configure Netlify

Set these environment variables for the site:

```text
AIRTABLE_PAT=pat_your_personal_access_token
AIRTABLE_BASE_ID=app_your_base_id
AIRTABLE_TABLE_NAME=Diary
```

Use Netlify's environment variable UI or CLI for secrets. Do not commit a `.env` file containing the token.

The function is at `netlify/functions/diary.js` and is available at `/api/diary` through `netlify.toml`.

## 3. Run locally

Install the Netlify CLI once:

```bash
npm install --global netlify-cli
```

Create a local `.env` file with the variables above, then start the site through Netlify:

```bash
netlify dev
```

The app will normally be available at `http://localhost:8888`. Running only `npm run dev` serves the Vue UI but does not run the serverless function.

## 4. Deploy

Build and verify the production bundle:

```bash
npm run build
```

Connect the repository to Netlify with `npm run build` as the build command and `dist` as the publish directory. Netlify automatically discovers the function under `netlify/functions`.

## Data migration

The app no longer reads the old `micro-diary-data` localStorage key. Export existing entries before switching to production and import them into Airtable using the field names above.