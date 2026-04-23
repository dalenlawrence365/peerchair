export const metadata = {
  title: 'PeerChair',
  description: 'The operating system for peer group chapter directors',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#080f1a' }}>
        {children}
      </body>
    </html>
  )
}
