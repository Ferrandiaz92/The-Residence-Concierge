// app/page.js
export default function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#1C3D2E' }}>The Residence Concierge</h1>
      <p style={{ color: '#555' }}>Intelligent Hotel Concierge Platform</p>
      <p style={{ color: '#888', fontSize: '14px' }}>API is running. Webhook endpoint: <code>/api/webhook</code></p>
    </main>
  )
}
