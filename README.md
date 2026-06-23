<div align="center">
  <img src="public/logo-loading.png" alt="Omni Health logo" width="112" />

  # Omni Health

  **AI-assisted clinical documentation and practice management, built around the patient.**

  [![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=111827)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
  [![Gemini](https://img.shields.io/badge/Google-Gemini-8E75B2?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)

  A responsive web platform that helps healthcare professionals manage patients and appointments, capture consultations, monitor clinical history, and turn consultation data into structured medical documents.
</div>

![A clean clinical workspace](public/banner-dashboard.png)

## Overview

Omni Health brings the core clinical workflow into one place. It combines patient and appointment management with browser-based speech recognition, laboratory PDF extraction, longitudinal health visualization, and generative AI to reduce repetitive documentation work.

The interface and clinical content are currently optimized for Brazilian Portuguese (`pt-BR`).

## Key features

- **Clinical dashboard** — daily and weekly consultation totals, recent patients, upcoming appointments, and activity charts.
- **Patient management** — registration, search, demographics, allergies, continuous medication, and medical history with ICD-10 data.
- **Consultation workspace** — anamnesis transcription, physical examination, vital signs, anthropometry, clinical history, and laboratory results.
- **AI-assisted documents** — editable SOAP-style medical records, prescriptions, medical certificates, and examination requests.
- **Voice transcription** — continuous `pt-BR` speech recognition through the browser Web Speech API, with optional transcript normalization.
- **Laboratory import** — text extraction from PDF laboratory reports and pattern-based identification of supported exam results.
- **Longitudinal records** — consultation timeline plus vital-sign and laboratory evolution charts with date filters.
- **Scheduling** — calendar-based appointment creation, patient association, and direct conversion from an appointment into a consultation.
- **Practice analytics** — consultation KPIs, patient activity, completion rates, and new-versus-returning patient distribution.
- **Professional branding** — clinician profile, registration details, clinic information, logo, signature, and printable/PDF document templates.
- **Authentication and access control** — Supabase Auth sessions with protected application routes.
- **Installable experience** — responsive UI and a web app manifest for mobile and desktop installation.

## Tech stack

| Area | Technologies |
| --- | --- |
| Application | Next.js 14 App Router, React 18, TypeScript |
| Styling and UI | Tailwind CSS, Lucide React, Sonner, `next-themes` |
| Backend | Next.js Route Handlers, Supabase Auth, PostgreSQL, Storage |
| Generative AI | Google Gemini; OpenRouter fallback for medical-record generation |
| Speech | MediaDevices API, Web Speech API |
| Document processing | `pdf-parse`, Tesseract.js, jsPDF, html2canvas |
| Data visualization | Recharts, date-fns |
| PWA assets | Web App Manifest, application icons |

## How it works

```text
Clinician
   |
   v
Next.js interface
   |-- Supabase Auth --------> authenticated session
   |-- Supabase Database ----> patients, appointments and consultations
   |-- Supabase Storage -----> logos and signatures
   |-- Web Speech API -------> live consultation transcript
   |-- PDF extraction -------> structured laboratory values
   `-- Server API routes ----> Gemini / OpenRouter document generation
```

AI provider keys remain on the server and are consumed only by Next.js route handlers. Supabase's public URL and anonymous key are exposed to the browser as intended; database access must therefore be protected with appropriate Row Level Security policies.

## Getting started

### Prerequisites

- Node.js 18.17 or newer
- npm, pnpm, or another Node.js package manager
- A Supabase project with Auth, Database, Storage, and suitable Row Level Security policies configured
- A Google Gemini API key for the complete AI workflow; OpenRouter is an optional fallback for medical-record generation
- A Chromium-based browser is recommended for consultation transcription

### 1. Clone and install

```bash
git clone <your-repository-url>
cd Plataforma_OminiHealth
npm install
```

### 2. Configure the environment

Create `.env.local` in the project root:

```dotenv
# Supabase — required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Google Gemini — required for AI generation and optional normalization
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL_ID=gemini-2.5-flash

# OpenRouter — optional fallback for medical-record generation
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_APP_NAME=OmniHealth
APP_URL=http://localhost:3000

# Transcript normalization: off | light | ai
ASR_NORMALIZE_MODE=off

# Optional document branding assets
NEXT_PUBLIC_SUS_LOGO_URL=
NEXT_PUBLIC_UPA_LOGO_URL=
```

`GEMINI_MODEL_ID` defaults to `gemini-2.5-flash`. Some document routes currently use `gemini-2.0-flash` directly. Never commit `.env` or `.env.local` files.

> The repository contains application code but no database migrations. Before running the full workflow, provision the Supabase tables used by the app: `profiles`, `patients`, `consultas`, `appointments`, `consultation_transcripts`, and `system_assets`, plus the `signatures` storage bucket.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and complete the clinician profile.

### Production build

```bash
npm run build
npm start
```

## Project structure

```text
src/
|-- app/
|   |-- (plataforma)/       # Authenticated dashboard and clinical modules
|   |-- api/                # AI, transcript normalization, branding and PDF APIs
|   |-- auth/               # Authentication callback and sign-out routes
|   |-- login/              # Sign-in experience
|   `-- signup/             # Account creation
|-- lib/                    # Speech, documents, OCR patterns and clinical datasets
|-- middleware.ts           # Session-aware route protection
`-- types/                  # Browser API type declarations

public/                     # Branding, banners, install images and PWA assets
```

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create an optimized production build |
| `npm start` | Run the production server |
| `npm run lint` | Run the configured Next.js lint command |

## Clinical safety and privacy

Omni Health is a clinical support and documentation tool. AI-generated content may be incomplete or incorrect and **must be reviewed, edited, and approved by a qualified healthcare professional** before it becomes part of a medical record or is delivered to a patient.

Deployments that process personal or health data must implement the safeguards required by their jurisdiction, including access control, encryption, auditability, retention rules, informed consent where applicable, secure provider agreements, and compliance with regulations such as Brazil's LGPD. This repository does not, by itself, certify regulatory compliance.

## Status

This project is under active development. Interfaces, data models, and AI integrations may change. It is not distributed under an open-source license at this time; all rights are reserved unless the repository owner states otherwise.

---

<div align="center">
  Built to give clinicians more time for what matters most: the patient.
</div>
