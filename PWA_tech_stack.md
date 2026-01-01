here's your PWA tech stack:

  Frontend Framework

  - Next.js 15 (App Router with React Server Components)
  - React 19
  - TypeScript

  UI/Styling

  - Tailwind CSS (utility-first CSS framework)
  - Lucide React (icon library)
  - CSS Variables (Geist Sans & Geist Mono fonts from next/font/google)

  PWA Features

  - Service Worker (for offline functionality)
  - Web Push Notifications (Push API)
  - Manifest.json (for installability)
  - PWA Install Prompt (custom component)

  Database & Auth

  - Supabase (PostgreSQL database + Authentication)
    - Magic link (OTP) authentication for family members
    - Password-based authentication for primary users
    - Row Level Security (RLS) for data access control
    - PostgreSQL functions for complex queries

  Backend/API

  - Next.js API Routes (serverless functions)
    - /api/auth/login - Password login
    - /api/auth/magic-link - Magic link generation
    - /api/checkin/nfc - NFC/QR check-in validation
    - /api/notifications/* - Push notification handling

  Storage

  - Supabase Storage (for caregiver photos)

  Hosting / DevOps

  - Vercel (Frontend hosting with auto-deployment from GitHub)
  - GitHub (Version control & CI/CD trigger)
  - Supabase Cloud (Backend-as-a-Service)

  Additional Features

  - NFC (Web NFC API for tap check-ins)
  - Geolocation API (for location verification)
  - Camera API (for photo capture)
  - QR Code Generation (qrcode.react)
  - Date Handling (date-fns with i18n support)
  - CSV Export (for data reporting)
  - Internationalization (French/English bilingual support)

  Your stack is a modern JAMstack architecture with serverless functions!