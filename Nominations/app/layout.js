import "./globals.css"

export const metadata = {
  title: "Hearing Voices",
  description: "Team voice/emoji party game",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
