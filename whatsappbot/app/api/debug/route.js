export async function GET() {
  return Response.json({
    status: 'ok',
    message: 'debug endpoint working',
    env: {
      supabase_url: process.env.SUPABASE_URL ? 'set' : 'MISSING',
      supabase_key: process.env.SUPABASE_SERVICE_KEY ? 'set' : 'MISSING',
      anthropic: process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING',
      twilio_number: process.env.TWILIO_WHATSAPP_NUMBER || 'MISSING',
    },
    timestamp: new Date().toISOString()
  })
}
```

Commit → wait for green → open:
```
https://theresidenceconcierge.vercel.app/api/debug
