import "./globals.css"

export const metadata = {
  title: "Alpha Jam",
  description: "Word race game",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
