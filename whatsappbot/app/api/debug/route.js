import { supabase } from '../../../src/lib/supabase.js'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('hotels')
      .select('id, name, whatsapp_number, active')
      .limit(5)

    if (error) {
      return Response.json({ 
        status: 'db_error', 
        error: error.message 
      })
    }

    return Response.json({ 
      status: 'ok', 
      hotels: data,
      env: {
        supabase_url: process.env.SUPABASE_URL ? 'set' : 'MISSING',
        supabase_key: process.env.SUPABASE_SERVICE_KEY ? 'set' : 'MISSING',
        anthropic: process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING',
        twilio_number: process.env.TWILIO_WHATSAPP_NUMBER || 'MISSING',
      }
    })
  } catch (err) {
    return Response.json({ 
      status: 'crash', 
      error: err.message 
    })
  }
}
```

5. Click **Commit new file**

---

Vercel will auto-redeploy in ~2 minutes. Then open:
```
https://theresidenceconcierge.vercel.app/api/debug
