import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/auth'

export const metadata: Metadata = {
  title: 'AI Sales Agent',
  description: 'AI-powered B2B sales execution platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
