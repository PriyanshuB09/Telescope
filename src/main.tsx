import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import './index.css'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

function Root() {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    {convex ? <ConvexAuthProvider client={convex}><App /></ConvexAuthProvider> : <SetupNotice />}
    <Toaster />
  </ThemeProvider>
}

function SetupNotice() {
  return <main className="grid min-h-svh place-items-center bg-muted/30 p-4">
    <section className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold">Connect your Convex workspace</h1>
      <p className="mt-2 text-muted-foreground">Run the project launcher in a terminal. On first setup, Convex CLI will ask you to sign in and select your personal team.</p>
      <pre className="mt-5 overflow-x-auto rounded-lg bg-muted p-4 text-sm"><code>.\run.ps1</code></pre>
      <p className="mt-4 text-sm text-muted-foreground">The launcher installs the packages, starts the Convex development deployment and opens the Vite app.</p>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>)
