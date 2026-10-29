# MarketMate Supermarket

A full-stack single-supermarket e-commerce starter project with a customer storefront, persistent SQLite database, admin inventory/orders dashboard, and sales/profit estimates.

## Requirements
- Windows 10/11
- Node.js 20 LTS or newer (Node.js 22 LTS recommended)
- Internet connection for the first dependency install

## Run on Windows
1. Extract `MarketMate_Supermarket.zip` to a folder such as `C:\MarketMate`.
2. Install Node.js from https://nodejs.org if it is not already installed.
3. Open that folder in File Explorer, click the address bar, type `cmd`, and press Enter.
4. Run:
   ```bat
   npm install
   copy .env.example .env
   notepad .env
   ```
5. In `.env`, change `SESSION_SECRET` to a long random string and change `ADMIN_PASSWORD` to a strong password you will remember. Set `ADMIN_PIN` for the admin PIN login (default starter PIN: `4146`; change it before public deployment). Change `ADMIN_EMAIL` too if desired. Save and close Notepad.
6. Start the app:
   ```bat
   npm start
   ```
7. Open http://localhost:3000 in your browser.

**First install may take a few minutes.** If `npm install` fails, install the current Node.js LTS release, close and reopen Command Prompt, then try again. `better-sqlite3` may need a compatible prebuilt binary for your Node version.

## Admin login
Use the **Admin login · PIN** button on the sign-in dialog. The starter PIN is `4146`; it is configured by `ADMIN_PIN` in `.env`, and should be changed before public deployment. Email/password admin login remains available only if you use the regular sign-in form. The default values in `.env.example` are only starter credentials. Set your own `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first run. The database creates the initial admin only if no admin user exists yet. If the database has already been created, changing `.env` does not reset that admin's password.

## Database and backups
- SQLite database: `data/marketmate.db`
- Product stock, customer accounts, orders, order items, and expenses persist after the app restarts.
- Back up the database file while the server is stopped. Do not delete `data/marketmate.db` unless you intentionally want to reset all app data.
- This project uses the default in-memory Express session store. For production/multi-instance hosting, configure a persistent session store.

## Included
- Customer registration/sign-in with bcrypt password hashing
- Guest customer checkout using name and phone without account creation
- Admin PIN sign-in (starter PIN 4146; change it before public deployment)
- Product search and category filters
- Cart saved in the current browser session
- Checkout for home delivery or store pickup
- Cash on delivery / pay at pickup
- Online payment selection is a placeholder only: it does **not** collect money. Integrate a payment gateway (e.g. Razorpay) with server-side order creation, signature verification, webhooks, and reconciliation before enabling real online payments.
- Atomic order creation and stock deduction
- Admin product creation/editing/removal and stock management
- Admin order status and payment status updates
- Low-stock overview, order counts, sales values, cost-based profit estimate, and expense entry
- Cancellation restores stock for a previously non-cancelled order

## Important production checklist
Before public launch:
- Use HTTPS and a strong `SESSION_SECRET`.
- Set `NODE_ENV=production` behind HTTPS.
- Use a persistent session store and rate limiting.
- Configure payment gateway credentials only in server environment variables and verify payment server-side.
- Add privacy policy, terms, refund/cancellation rules, delivery zones, support contacts, tax invoices, and backups.
- Test stock, cancellations, and all order statuses with sample orders.
- Replace sample products/prices with your real supermarket inventory.
- This is a functional starter, not a production-audited payment or accounting system.
