# Push Notifications Setup

## 1. Install web-push

```bash
cd whatsappbot
npm install web-push
```

## 2. Generate VAPID keys (run once)

```bash
npx web-push generate-vapid-keys
```

Copy the output and add to your `.env.local` (and Vercel environment variables):

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your public key>
VAPID_PRIVATE_KEY=<your private key>
VAPID_MAILTO=mailto:admin@theresidence.com
CRON_SECRET=<any long random string>
```

## 3. Run the Supabase migration

In Supabase Dashboard → SQL Editor, run:
```
supabase/push_notifications.sql
```

## 4. Add Vercel cron for the 9am digest

In your project root create or update `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/push/digest",
      "schedule": "0 7 * * *"
    }
  ]
}
```
7 UTC = 9am Cyprus time. Adjust if hotel timezone differs.

## 5. Add the Authorization header for the cron

Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when calling cron routes.
Make sure `CRON_SECRET` matches in your env vars.

## 6. iOS — tell staff to add to Home Screen

Safari on iOS only supports Web Push if the site is added to the Home Screen:
1. Open the dashboard in Safari
2. Tap the Share button (□↑)
3. Tap "Add to Home Screen"
4. Open the app from the Home Screen icon
5. The notification permission banner will appear

## How it works

| Trigger | Who gets notified | Type |
|---|---|---|
| New Urgent ticket | Dept staff | 🚨 Immediate loud |
| New Today ticket | Dept staff | 📋 Immediate standard |
| New Planned ticket | Dept staff | 📅 Daily digest at 9am |
| Guest escalation | Reception | 🔔 Immediate, stays on screen |
| Ticket resolved | Reception | ✅ Silent |
