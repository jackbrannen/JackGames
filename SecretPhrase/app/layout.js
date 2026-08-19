import "./globals.css"

export const metadata = {
  title: "Secret Phrase",
  description: "Slip the secret phrase into your answer",
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
