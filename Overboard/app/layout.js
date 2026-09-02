import "./globals.css"

export const metadata = {
  title: "Overboard",
  description: "Everyone writes a question. Nobody answers their own.",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
