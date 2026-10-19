# Cloud ERP Lite with WhatsApp

A lightweight cloud ERP for small businesses. Staff manage products, orders, invoices, employees and leave requests from a web dashboard, and can run the same day-to-day tasks from **WhatsApp** by texting simple commands to a Twilio-powered bot.


## Features

- **Authentication & roles** – JWT login with `ADMIN`, `MANAGER` and `EMPLOYEE` roles.
- **Inventory** – products with SKU, quantity, reorder level, category, supplier and status; low-stock tracking.
- **Orders** – create and track orders (items, total, status, payment status).
- **Invoices** – generate invoices from orders with tax and discount, and track payment status.
- **HR** – employee records and leave requests with an approval workflow.
- **WhatsApp bot** – query stock, check orders, view the dashboard, create orders and apply for leave from WhatsApp.
- **Cloud backend** – Firebase Cloud Functions receive the Twilio webhook and store sales and inventory data in Firestore.

## Architecture

```
React dashboard ──► Express REST API ──► PostgreSQL (Prisma)
                         ▲
WhatsApp user ──► Twilio ──► Firebase Cloud Function (/webhook) ──► Firestore
```

| Part | Folder | Tech |
|---|---|---|
| Web app | `cloud-erp-lite/frontend` | React, Tailwind CSS |
| REST API | `cloud-erp-lite/backend` | Node.js, Express, Prisma, PostgreSQL, JWT, Helmet, rate limiting |
| WhatsApp / cloud functions | `functions` | Firebase Cloud Functions (Node 22), Firestore, Twilio |
| Firebase config | repo root | `firebase.json`, `firestore.rules`, `storage.rules` |

## WhatsApp commands

| Command | What it does |
|---|---|
| `HELP`, `MENU`, `START` | Show the command list |
| `CHECK STOCK [name]`, `STOCK [name]` | Check stock for all products or one product |
| `LOW STOCK` | List products below their reorder level |
| `MY ORDERS`, `ORDERS` | List your orders |
| `ORDER STATUS <number>` | Status of an order |
| `MY LEAVES`, `LEAVES` | Your leave requests |
| `DASHBOARD`, `STATS` | Business summary |
| `TODAY` | Today's activity |
| `CREATE ORDER`, `NEW ORDER` | Start a new order |
| `APPLY LEAVE`, `NEW LEAVE` | Apply for leave |
| `SALES REPORT` | Sales report |

## REST API (backend)

Base URL: `http://localhost:5002`

`/api/auth`, `/api/products`, `/api/orders`, `/api/invoices`, `/api/employees`, `/api/leaves`, `/api/whatsapp`

A Postman collection is in `cloud-erp-lite/backend/docs/`.

## Getting started

### Prerequisites

Node.js 18+ (22 for the Cloud Functions), PostgreSQL, a Twilio account with the WhatsApp sandbox, and a Firebase project.

### Backend

```bash
cd cloud-erp-lite/backend
npm install
# create a .env with your database URL, JWT secret and PORT
npx prisma migrate dev
node prisma/seed.js        # optional sample data
npm run dev
```

### Frontend

```bash
cd cloud-erp-lite/frontend
npm install
npm start                  # http://localhost:3000
```

### Cloud Functions (WhatsApp)

```bash
cd functions
npm install
cp .env.example .env       # fill in your Twilio values
firebase emulators:start --only functions
firebase deploy --only functions
```

Point your Twilio WhatsApp sandbox webhook at the deployed `/webhook` URL.

## Configuration

Secrets are **never** committed. Set them in local `.env` files:

| File | Variables |
|---|---|
| `functions/.env` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` |
| `cloud-erp-lite/backend/.env` | database connection, JWT secret, `PORT`, `CLIENT_URL` |

The Firebase service account key (`functions/serviceAccountKey.json`) is also git-ignored. Download your own from the Firebase console.

## Project status

Some files in the original working copy were damaged by disk corruption before this repository was created. The frontend source was restored from the production build's source map. Parts of the backend and the Cloud Function may still be incomplete until they are restored from a healthy copy.

## Tech stack

React · Tailwind CSS · Node.js · Express · Prisma · PostgreSQL · Firebase Cloud Functions · Firestore · Twilio WhatsApp API
