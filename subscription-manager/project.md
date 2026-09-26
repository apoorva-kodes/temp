Subscription Manager - Project Overview & Status

Project Description

The app collects user data about various subscription-based services. It captures the service name, billing period, cost per period, payment method, payment link, and cancellation URL.

"My Subscriptions" View (Looking View): Displays all subscription data in a structured table. Subscriptions with billing cycles that are ending are highlighted and moved to the top with an indicator (e.g., an exclamation mark). Users can filter and arrange data by billing period and billing range to easily analyze active services, manage expenses, and spot redundancies to avoid wasting money.

"Add Subscription" View (Adding View): A separate view featuring text fields for service name, payment/cancellation URLs, payment method, and amount due per period. A standardized dropdown menu is used for selecting the billing period to ensure uniform calculations and summaries across all entries.

Where We Are Right Now

Architecture: Built as a self-contained Single-Page Application (SPA) in a single HTML file (index.html) using Tailwind CSS and native JavaScript for dynamic view switching without page reloads.

UI Theme & Styling: The main background color is set to pure black (bg-black) with high-contrast dark mode accents (bg-zinc-900, bg-zinc-950). The primary dashboard view tab is titled "My Subscriptions".

Data State: The application initializes in a clean slate state (blank canvas) with no pre-populated mock data, ready for direct user input.

Core Views:

"My Subscriptions": Fully structured table layout with headers for Service, Cost, Billing Period, Payment Method, Quick Links, and Actions, complete with filter bar controls for billing period and cost range.

"Add Subscription": Form view featuring user text fields for custom details and a controlled dropdown selector for billing frequencies (e.g., Monthly, Yearly, Weekly, Quarterly).

Change Log

v1.0.0 — Initial single-file web application structure created with view switching between subscription table and add form.

v1.1.0 — Removed pre-populated sample data so the application starts completely blank for user entry.

v1.2.0 — Updated main app background to pure black (bg-black) and renamed the primary dashboard tab/view from "Looking View" to "My Subscriptions".

v2.0.0 — Backend Integration: Connected the frontend directly to a Supabase PostgreSQL database (`subscriptions` table) via CDN. Replaced local state persistence with live asynchronous database operations (`select`, `insert`, `delete`).

v2.1.0 — Global Client Binding: Attached the Supabase client instance globally to `window._supabase` to allow browser console debugging and testing.

v2.2.0 — Database Schema Expansion: Added columns for `next_billing_date`, `is_ending_soon`, `payment_method`, `payment_link`, and `cancellation_url` to match the frontend payload structure.

v2.3.0 — Row Level Security (RLS) Configuration: Enabled RLS on the `subscriptions` table and created permissive public policies (`SELECT`, `INSERT`, `DELETE`) for the `anon` role (`USING (true)` / `WITH CHECK (true)`).