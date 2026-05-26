import "./globals.css"

export const metadata = { title: "Reverse Charades" }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
