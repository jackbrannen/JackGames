import "./globals.css"

export const metadata = {
  title: 'What On Earth',
  description: 'Alien Translation Game',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
