# AP Study Resource Hub

Build 2 plan: CONFIRMED by Build 2 Planner on October 4, 2026.

## What the app does and who it's for

An AP study resource sharing platform where high school students self-studying AP classes (like AP Physics C, Calculus BC, Chemistry, etc.) can upload, organize, search, and share College Board progress checks, FRQs, practice problems, and class notes. Built for the student creator, Mr. Tortilla, Mr. Deal, and Mr. Sargus.

## Sign-in

* Email + password sign-in with password enforcement (8+ characters, lowercase, uppercase, number).
* Sign in with GitHub via OAuth (with dynamic callback redirect to origin/pathname).
* Persistent sessions across refreshes and sign-out functionality.
* Unique username setup on first sign-in for all authentication methods (both Email and GitHub OAuth) to display `@username` handles instead of emails across the app. Automatic fallback handle generation for GitHub users if initial profile creation is bypassed.

## Tables

* `profiles`
  * `id` (uuid, primary key, references auth.users)
  * `username` (text, unique)
  * `created_at` (timestamp)
* `resources`
  * `id` (uuid, primary key)
  * `user_id` (uuid, references profiles.id)
  * `username` (text)
  * `title` (text)
  * `subject` (text, e.g., AP Physics C: Mechanics)
  * `tags` (text / array)
  * `file_url` (text - signed or direct public link to stored file in `user-files` bucket)
  * `file_name` (text)
  * `file_size` (numeric)
  * `file_path` (text)
  * `created_at` (timestamp)

## Who can see what

* `profiles`: All signed-in users can read profiles to view usernames. Users can only edit/insert their own profile record.
* `resources`: All signed-in users can read all resource posts (public by default). Users can only insert, update, or delete resource posts where `user_id` matches their own authenticated ID.

## Buckets

* Bucket Name: `user-files`
* File Size Limit: 25 MB per file
* Allowed File Types: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.mp4`, `.webm`, `.ogg`, `.mov`, `.mp3`, `.wav`, `.m4a`, `.pdf`
* Bucket Rules: Publicly readable by all signed-in users; uploads and deletions restricted to the owner of the resource. Upload progress tracked in real-time using native `XMLHttpRequest` progress listeners against the Supabase Storage API.

## Screens

1. Sign In / Sign Up Screen (with working GitHub OAuth sign-in)
2. Username Setup Screen (for first-time sign-ins)
3. Homepage Main Feed (shows user's Saved Files and My Files; top header search triggers redirect to Search Page)
4. Dedicated Search & Filter Hub Screen (contains custom search text input, AP subject filter pills, and in-page live search results display)
5. Dedicated Community Resources Screen (accessed via top navigation bar; displays top 10 most recent files per AP subject)
6. Add Resource View (modal interface for file selection up to 25 MB with real-time percentage progress bar)

## Code files

* `index.html`: Contains all page structural content and CSS styles, loading `config.js` before `app.js`.
* `app.js`: Contains all JavaScript logic, including Supabase client initialization, GitHub OAuth authentication, native XHR real-time upload progress tracking, search & filter routing, and UI rendering.
* `config.js`: Contains only the Supabase project URL and the publishable key (`SUPABASE_ANON_KEY`).

## Rules for every chat

* This app uses exactly three code files: index.html, app.js, config.js. Do not create more.
* index.html contains the HTML and CSS, and loads config.js before app.js.
* config.js contains only the Supabase URL and the publishable key.
* When you change code, name the file and give me the whole file, not a snippet.
* Change nothing I did not ask you to change.
* Never put a secret key in any file.

## Addresses

GitHub Pages URL: to fill in

## Secrets

* GitHub client secret: stored securely in Supabase dashboard under GitHub sign-in settings (never exposed in client code).

## Where we are right now

Architecture restructured: dedicated search page, community resources view, working GitHub OAuth sign-in, real-time native upload progress bar tracking, and 25 MB upload limit operational.

## NOT doing, on purpose

* Full-text search inside PDF/DOCX file contents (Requires server backend / OCR — Build 3/4).
* External API integrations or AI file summarization (Build 3 / Build 4).
* Email confirmation / Forgot Password emails (Supabase free tier email limit).

## Next thing I want to add

Set up additional subject collections or enhance mobile drawer navigation.

## Change log

* October 4, 2026: Planning session with Build 2 Planner. Plan confirmed.
* October 25, 2026: Updated project specification to detail mandatory username onboarding for GitHub.
* November 3, 2026:
  - Removed top navigation search/upload buttons and deleted the homepage "All Community Resources" section.
  - Created a dedicated Search & Filter page with in-page results rendering (no redirect back to feed).
  - Added a "Browse Community Resources" top button and dedicated screen displaying the 10 most recent files per AP subject.
  - Fixed GitHub OAuth sign-in pipeline with dynamic redirect URLs and non-blocking profile resolution.
  - Reinstated real-time file upload progress bar using native `XMLHttpRequest` tracking.
  - Expanded file upload size limit from 10 MB to 25 MB across validation rules and UI labels.