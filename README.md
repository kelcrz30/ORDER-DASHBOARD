# Butterhaus Order Dashboard

A private React + Supabase order dashboard for listing cookie orders, auto-calculating totals/change/balance, and generating a production summary per flavor and size.

## Features

- Email/password login via Supabase Auth
- Add customer orders with multiple cookie items
- 60g and 100g size support
- Auto price fill from your flavor price list
- Auto-compute total, paid, change, and balance
- Production summary: total pcs needed per flavor + size
- Paid / Partial / Unpaid filters
- Batch date filter
- Search customer/flavor/notes
- CSV export
- Flavor and price manager
- Secure Row Level Security (RLS): each logged-in account only sees its own data

## Setup

### 1. Create a Supabase project

Go to Supabase, create a project, then open:

`Project Settings > API`

Copy:
- Project URL
- Anon public key

### 2. Run the database SQL

Open:

`Supabase Dashboard > SQL Editor`

Paste and run:

`supabase/schema.sql`

### 3. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

### 5. Create your account

Use the Sign Up form inside the app.

The app will auto-create starter flavors/prices for your account the first time you log in.

## Notes

- Edit the default prices inside the Flavor & Price Manager.
- Keep your Supabase service role key private. Never put it in frontend code.
- This project uses the anon/public key only, protected by RLS policies.
