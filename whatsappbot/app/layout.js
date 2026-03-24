import '../dashboard.css'

export const metadata = {
  title: 'The Residence Concierge',
  description: 'Intelligent Hotel Concierge Platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
