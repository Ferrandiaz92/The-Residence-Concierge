# The Residence Concierge — Week 1 Setup Guide

## What you're building
A WhatsApp bot that:
- Receives guest messages via Twilio
- Calls Claude to generate intelligent replies
- Detects booking intent and fires partner alerts
- Logs everything to Supabase

---

## File structure

```
residence-concierge/
├── .env.example              ← copy to .env.local and fill in
├── package.json
├── supabase/
│   └── schema.sql            ← run this first in Supabase
├── src/
│   ├── lib/
│   │   ├── supabase.js       ← all DB helpers
│   │   ├── claude.js         ← Anthropic API calls
│   │   ├── twilio.js         ← send/receive WhatsApp
│   │   └── language.js       ← detect language, build prompts, parse bookings
│   ├── webhooks/
│   │   ├── whatsapp-inbound.js  ← main bot logic
│   │   └── partner-reply.js     ← handles ✅ ❌ from partners
│   └── api/
│       └── webhook/
│           └── route.js         ← Next.js endpoint Twilio calls
└── scripts/
    └── test-bot.js           ← test without real phone
```

---

## Step 1 — Create accounts (all free to start)

| Service | URL | What for | Free tier |
|---|---|---|---|
| Supabase | supabase.com | Database | 500MB, unlimited API |
| Twilio | twilio.com | WhatsApp | $15 trial credit |
| Anthropic | console.anthropic.com | Claude AI | Pay per use ~€0.01/msg |
| Vercel | vercel.com | Hosting | Free unlimited |
| GitHub | github.com | Code | Free |

---

## Step 2 — Database setup

1. Go to Supabase Dashboard → New Project
2. Copy your project URL and service role key
3. Go to SQL Editor → paste the entire contents of `supabase/schema.sql`
4. Click Run — this creates all tables, indexes, views, and seed data

---

## Step 3 — Twilio WhatsApp setup

**For testing (Sandbox — free, instant):**
1. Twilio Dashboard → Messaging → Try it out → Send a WhatsApp message
2. Follow instructions to join the sandbox (send a code from your phone)
3. In sandbox settings, set webhook URL to: `https://your-app.vercel.app/api/webhook`

**For production (WhatsApp Business — takes 1-2 weeks to approve):**
1. Twilio Dashboard → Messaging → Senders → WhatsApp Senders
2. Apply for a WhatsApp Business number
3. Once approved, set the same webhook URL

---

## Step 4 — Local development setup

```bash
# Clone/create the project
mkdir residence-concierge && cd residence-concierge

# Copy all the files from this package into the folder

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your actual keys

# Test the bot locally (no Twilio needed)
node --experimental-vm-modules scripts/test-bot.js

# Or test a single message
node scripts/test-bot.js "I need a taxi to Larnaca airport at 6pm"

# Test in Russian
node scripts/test-bot.js --lang ru "Мне нужно такси"
```

---

## Step 5 — Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Project Settings → Environment Variables → add all from .env.example

# Get your deployment URL e.g. https://residence-concierge.vercel.app
```

---

## Step 6 — Connect Twilio webhook

1. Go to Twilio Console
2. Find your WhatsApp number / sandbox
3. Set webhook URL: `https://residence-concierge.vercel.app/api/webhook`
4. Method: HTTP POST

---

## Step 7 — Test end-to-end

**Test 1: Basic conversation**
- Send "Hello" from your phone to the hotel WhatsApp number
- Should get a warm greeting back in English

**Test 2: Language detection**
- Send "Привет" → should reply in Russian
- Send "שלום" → should reply in Hebrew

**Test 3: Taxi booking**
- Send "I need a taxi to Larnaca airport at 6pm tomorrow, 2 passengers"
- Bot asks for confirmation
- Reply "Yes please"
- Your partner test phone should receive the booking alert
- Reply ✅ from the partner phone
- Your guest phone should receive confirmation

**Test 4: Dashboard search**
- Open the admin dashboard
- Search for your room number or phone number
- Should see the conversation and the booking

---

## Step 8 — Adding a real hotel

Update the seed data in Supabase or insert directly:

```sql
-- Add real hotel
insert into hotels (name, whatsapp_number, system_prompt, config)
values (
  'Your Hotel Name',
  '+35799XXXXXX',    -- your Twilio number
  'You are the concierge at [Hotel Name]...',  -- customize this!
  '{
    "address": "...",
    "checkin_time": "15:00",
    "checkout_time": "12:00"
  }'
);

-- Add real partners (taxi drivers, restaurants)
insert into partners (hotel_id, name, type, phone, commission_rate)
values (
  '[hotel-id-from-above]',
  'Christos Taxi',
  'taxi',
  '+35799XXXXXX',
  10.00
);
```

---

## Troubleshooting

**Bot not responding?**
- Check Vercel function logs: Vercel Dashboard → your project → Functions
- Check Twilio webhook delivery: Twilio Console → Monitor → Logs
- Verify webhook URL is correct and returns 200

**Wrong language?**
- The language detection is automatic from the message content
- Hebrew uses Unicode range \u0590-\u05FF
- Russian uses Cyrillic range \u0400-\u04FF

**Booking not detected?**
- Claude needs to include `[BOOKING_REQUEST]` in its response
- Test locally first: `node scripts/test-bot.js "book me a taxi"`
- Check the system prompt is being built correctly

**Partner not receiving alerts?**
- Verify partner phone is in E.164 format: +35799000010
- Check Twilio has permission to message that number (sandbox requires opt-in)
- Check Twilio logs for delivery errors

---

## Costs at launch (5 hotels, 200 messages/day)

| Service | Monthly cost |
|---|---|
| Supabase | Free |
| Vercel | Free |
| Twilio WhatsApp | ~€15-30 |
| Claude API | ~€20-40 |
| **Total** | **~€35-70/month** |

---

## Week 2 preview: Admin Dashboard

Next you'll build the hotel admin dashboard in Next.js with:
- Login page (one set of credentials per hotel)
- Search bar (room number / surname / phone)
- Conversations view (all WhatsApp threads)
- Recent reservations table
- Commission totals

All data is already being stored — the dashboard just reads from Supabase.
