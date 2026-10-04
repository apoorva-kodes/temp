# AP Study Resource Hub

Build 2 plan: CONFIRMED by Build 2 Planner on October 4, 2026.

## What the app does and who it's for
An AP study resource sharing platform where high school students self-studying AP classes (like AP Physics C) can upload, organize, search, and share College Board progress checks, FRQs, practice problems, and class notes. Built for the student creator, Mr. Tortilla, Mr. Deal, and Mr. Sargus.

## Sign-in
- Email + password sign-in with password enforcement (8+ characters, lowercase, uppercase, number).
- Sign in with GitHub via OAuth.
- Persistent sessions across refreshes and sign-out functionality.
- Unique username setup on first sign-in (shown across the app instead of email address).

## Tables
- `profiles`
  - `id` (uuid, primary key, references auth.users)
  - `username` (text, unique)
  - `created_at` (timestamp)
- `resources`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references profiles.id)
  - `title` (text)
  - `subject` (text, e.g., AP Physics C)
  - `tags` (text / array)
  - `file_url` (text)
  - `file_name` (text)
  - `created_at` (timestamp)

## Who can see what
- `profiles`: All signed-in users can read profiles to view usernames. Users can only edit/insert their own profile record.
- `resources`: All signed-in users can read all resource posts (public by default). Users can only insert, update, or delete resource posts where `user_id` matches their own authenticated ID.

## Buckets
- Bucket Name: `ap-resources`
- File Size Limit: 25 MB per file
- Allowed File Types: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.docx`, `.txt`
- Bucket Rules: Publicly readable by all signed-in users; uploads and deletions restricted to the owner of the resource.

## Screens
1. Sign In / Sign Up Screen
2. Username Setup Screen (for first-time sign-ins)
3. Homepage / Main Resource Feed (view all saved and public resources)
4. Add Resource View (upload files, set title, AP subject, and tags)
5. Search & Filter View (search resources by title, AP subject, and tags)
6. Account Settings / Change Password Screen

## Code files
- `index.html`: Contains all page structural content and CSS styles, loading `config.js` before `app.js`.
- `app.js`: Contains all JavaScript logic, including Supabase operations, UI rendering, file uploads, search filtering, and state management.
- `config.js`: Contains only the Supabase project URL and the publishable key (`sb_publishable_`).

## Rules for every chat
- This app uses exactly three code files: index.html, app.js, config.js. Do not create more.
- index.html contains the HTML and CSS, and loads config.js before app.js.
- config.js contains only the Supabase URL and the publishable key.
- When you change code, name the file and give me the whole file, not a snippet.
- Change nothing I did not ask you to change.
- Never put a secret key in any file.

## Addresses
GitHub Pages URL: to fill in

## Secrets
- GitHub client secret: in Supabase, under GitHub sign-in settings

## Where we are right now
Planning complete, nothing built yet.

## NOT doing, on purpose
- Full-text search inside PDF/DOCX file contents (Requires server backend / OCR — Build 3/4).
- External API integrations or AI file summarization (Build 3 / Build 4).
- Email confirmation / Forgot Password emails (Supabase free tier email limit).

## Next thing I want to add
Set up Supabase sign-in settings, then email + password sign-in.

## Change log
- October 4, 2026: Planning session with Build 2 Planner. Plan confirmed.