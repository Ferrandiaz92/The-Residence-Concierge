// app/payment-success/page.js
// Simple branded page shown to guests after payment
// They can close this and return to WhatsApp

export default function PaymentSuccess() {
  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Payment confirmed</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'DM Sans', sans-serif; background: #0D2318; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        `}</style>
      </head>
      <body>
        <div style={{ textAlign: 'center', maxWidth: '360px', margin: '0 auto' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto 24px' }}>
            ✅
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#C9A84C', marginBottom: '12px' }}>
            Payment confirmed!
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6', marginBottom: '32px' }}>
            Your booking is confirmed. You'll receive a WhatsApp message with all the details shortly.
          </p>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
            You can close this page and return to WhatsApp.
          </p>
        </div>
      </body>
    </html>
  )
}
