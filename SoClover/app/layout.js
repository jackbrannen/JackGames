import "./globals.css"

export const dynamic = "force-dynamic"
export const metadata = { title: "So Clover" }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ background: "#6B8C2A" }}>{children}</body>
    </html>
  )
}
