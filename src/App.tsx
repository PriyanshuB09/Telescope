import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { Navigate, NavLink, Outlet, RouterProvider, createBrowserRouter } from 'react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { lazy, Suspense, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  Command,
  Flag,
  Gauge,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useUiStore } from '@/stores/ui-store'
const EventSetupPage = lazy(() => import('@/features/event-setup-page').then((module) => ({ default: module.EventSetupPage })))
const TeamsPage = lazy(() => import('@/features/scouting-pages').then((module) => ({ default: module.TeamsPage })))
const PitScoutingPage = lazy(() => import('@/features/scouting-pages').then((module) => ({ default: module.PitScoutingPage })))
const MatchScoutingPage = lazy(() => import('@/features/scouting-pages').then((module) => ({ default: module.MatchScoutingPage })))
const PickListsPage = lazy(() => import('@/features/pick-lists-page').then((module) => ({ default: module.PickListsPage })))

const router = createBrowserRouter([
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'pit', element: <PitScoutingPage /> },
      { path: 'matches', element: <MatchScoutingPage /> },
      { path: 'pick-lists', element: <PickListsPage /> },
      { path: 'admin', element: <AdminRoute /> },
      { path: 'admin/event', element: <AdminRoute><EventSetupPage /></AdminRoute> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '/sign-in', element: <SignInRoute /> },
])

export default function App() {
  return <RouterProvider router={router} />
}

function SignInRoute() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  if (isLoading) return <div className="grid min-h-svh place-items-center">Connecting to Convex…</div>
  if (isAuthenticated) return <Navigate to="/" replace />
  return <SignInPage />
}

function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  if (isLoading) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Connecting to Convex…</div>
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />

  return <Suspense fallback={<div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Loading workspace…</div>}><AppShell /></Suspense>
}

function AppShell() {
  const user = useQuery(api.users.currentUser)
  const canBootstrapAdmin = useQuery(api.users.canBootstrapAdmin)
  const bootstrapAdmin = useMutation(api.users.bootstrapFirstAdmin)
  const activeRoute = useUiStore((state) => state.activeRoute)
  const setActiveRoute = useUiStore((state) => state.setActiveRoute)

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />}><Menu /></SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="mb-4 flex items-center gap-2"><Gauge className="size-5" /> REBUILT Scout</SheetTitle>
              <Navigation activeRoute={activeRoute} setActiveRoute={setActiveRoute} isAdmin={user?.role === 'admin'} />
            </SheetContent>
          </Sheet>
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Gauge className="size-4" /></span>
            <span>REBUILT Scout</span>
          </NavLink>
          <div className="hidden flex-1 md:block"><Navigation activeRoute={activeRoute} setActiveRoute={setActiveRoute} isAdmin={user?.role === 'admin'} horizontal /></div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.username ?? 'Signed in'}</span>
            {canBootstrapAdmin && <Button size="sm" variant="outline" onClick={() => void bootstrapAdmin().then(() => toast.success('Administrator access enabled.')).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Admin setup failed.'))}>Enable admin</Button>}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"><Outlet /></main>
      <footer className="mx-auto max-w-7xl px-4 pb-6 text-xs text-muted-foreground sm:px-6">
        {user?.role === 'admin' ? 'Administrator' : 'Scout'} access · Convex-backed account
      </footer>
    </div>
  )
}

function Navigation({ horizontal = false, activeRoute, setActiveRoute, isAdmin }: { horizontal?: boolean; activeRoute: string; setActiveRoute: (route: string) => void; isAdmin: boolean }) {
  const links = [
    { to: '/', label: 'Dashboard', icon: Gauge },
    { to: '/teams', label: 'Teams', icon: Users },
    { to: '/pit', label: 'Pit scouting', icon: ClipboardCheck },
    { to: '/matches', label: 'Match scouting', icon: Activity },
    { to: '/pick-lists', label: 'Pick lists', icon: ListOrdered },
    ...(isAdmin ? [{ to: '/admin/event', label: 'Event setup', icon: Flag }, { to: '/admin', label: 'Administration', icon: Flag }] : []),
  ]
  return <nav className={horizontal ? 'flex items-center gap-1 pl-4' : 'grid gap-1'} aria-label="Main navigation">
      {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setActiveRoute(to)} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${isActive || activeRoute === to ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${horizontal ? 'whitespace-nowrap' : ''}`}>
      <Icon className="size-4" />{label}
    </NavLink>)}
  </nav>
}

function DashboardPage() {
  const user = useQuery(api.users.currentUser)
  const event = useQuery(api.events.activeEvent)
  const summary = useQuery(api.scouting.dashboardSummary, event ? { eventId: event.id } : 'skip')
  const stats = [
    { label: 'Event teams', value: summary ? `${summary.teams}${summary.capped ? '+' : ''}` : '—', hint: event?.name ?? 'Import an event to begin', icon: Users },
    { label: 'Pit reports', value: summary ? `${summary.pitReports}${summary.capped ? '+' : ''}` : '—', hint: 'Teams with saved pit reports', icon: ClipboardCheck },
    { label: 'Qualification matches', value: summary ? `${summary.matches}${summary.capped ? '+' : ''}` : '—', hint: 'Imported schedule', icon: Activity },
    { label: 'Match reports', value: summary ? `${summary.submittedReports}${summary.capped ? '+' : ''}` : '—', hint: 'Submitted observations', icon: ListOrdered },
  ]
  return <div className="space-y-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Flag className="size-4" />2026 REBUILT</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Event scouting, at a glance</h1><p className="mt-2 max-w-2xl text-muted-foreground">{user?.name ? `Welcome, ${user.name}.` : 'Welcome.'} Bring your scouting team together around reliable, fast observations.</p></div>
      <Button render={<NavLink to={event ? '/teams' : user?.role === 'admin' ? '/admin/event' : '/teams'} />}>{event ? 'Open team workspace' : user?.role === 'admin' ? 'Set up event' : 'Open team workspace'} <ArrowRight className="ml-2 size-4" /></Button>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Event summary">
      {stats.map(({ label, value, hint, icon: Icon }) => <article key={label} className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium">{label}</p><Icon className="size-4 text-muted-foreground" /></div><p className="mt-5 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></article>)}
    </section>
    <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <article className="rounded-xl border bg-card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Command className="size-5" /></span><div><h2 className="font-semibold">{event ? event.name : 'Your event workspace is ready'}</h2><p className="text-sm text-muted-foreground">{event ? `${event.tbaEventKey} · Live scouting data from Convex` : 'Your Convex development workspace is connected.'}</p></div></div><Separator className="my-5" />{event ? <div className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg bg-muted/60 p-3"><span className="mb-1 block font-medium text-foreground">Qualification schedule</span>{summary?.matches ?? 'Loading'} matches available.</div><div className="rounded-lg bg-muted/60 p-3"><span className="mb-1 block font-medium text-foreground">Pit scouting</span>{summary ? `${summary.pitReports} of ${summary.teams} teams have reports.` : 'Loading event summary…'}</div><div className="rounded-lg bg-muted/60 p-3"><span className="mb-1 block font-medium text-foreground">Match scouting</span>{summary?.submittedReports ?? 'Loading'} submitted reports.</div></div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{user?.role === 'admin' ? <>No event imported. Start by importing the 2026 event from The Blue Alliance. <NavLink to="/admin/event" className="font-medium text-primary underline">Open event setup</NavLink>.</> : 'No active event yet. Ask an administrator to import the team’s event.'}</div>}</article>
      <article className="rounded-xl border bg-card p-5 sm:p-6"><h2 className="font-semibold">Quick actions</h2><p className="mt-1 text-sm text-muted-foreground">Jump into the next scouting workflow.</p><div className="mt-4 grid gap-2"><QuickLink to="/pit" icon={<ClipboardCheck />} label="Pit scouting" /><QuickLink to="/matches" icon={<Activity />} label="Match scouting" /><QuickLink to="/pick-lists" icon={<ListOrdered />} label="Pick lists" /></div></article>
    </section>
  </div>
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return <Button variant="outline" render={<NavLink to={to} />} className="h-11 justify-start">{icon}<span className="ml-2">{label}</span><ArrowRight className="ml-auto size-4" /></Button>
}

function WorkspacePage({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return <section className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10"><div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div><h1 className="mt-5 text-2xl font-semibold">{title}</h1><p className="mt-2 text-muted-foreground">{description}</p><div className="mt-6 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No event is connected yet. Event import and scouting workflows will be added on this foundation.</div></section>
}

function AdminRoute({ children }: { children?: React.ReactNode }) {
  const user = useQuery(api.users.currentUser)
  if (user === undefined) return <div className="text-sm text-muted-foreground">Loading permissions…</div>
  if (user?.role !== 'admin') return <WorkspacePage title="Admin access required" description="This area is available to the event administrator." icon={<Flag />} />
  if (children) return children
  return <section className="mx-auto max-w-3xl space-y-5"><div><p className="text-sm font-medium text-primary">Administrator tools</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Administration</h1><p className="mt-2 text-muted-foreground">Manage the active event and the team’s alliance selection workspace.</p></div><div className="grid gap-3 sm:grid-cols-2"><QuickLink to="/admin/event" icon={<Flag />} label="Event setup and TBA import" /><QuickLink to="/pick-lists" icon={<ListOrdered />} label="Primary pick list and consensus merge" /></div><p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Scouting record corrections and role checks are enforced by Convex. The one-time administrator bootstrap is complete once the account matching the configured deployment username enables admin access.</p></section>
}

function SignInPage() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [pending, setPending] = useState(false)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    if (flow === 'signUp' && formData.get('password') !== formData.get('confirmPassword')) {
      toast.error('Passwords do not match.')
      return
    }
    setPending(true)
    formData.set('flow', flow)
    try {
      await signIn('password', formData)
      toast.success(flow === 'signIn' ? 'Signed in successfully.' : 'Account created. You are signed in.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to authenticate. Please try again.')
    } finally {
      setPending(false)
    }
  }
  return <main className="grid min-h-svh place-items-center bg-muted/30 p-4">
    <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Gauge className="size-5" /></span><div><p className="font-semibold">REBUILT Scout</p><p className="text-xs text-muted-foreground">FRC 2026 event workspace</p></div></div>
      <h1 className="text-2xl font-semibold tracking-tight">{flow === 'signIn' ? 'Welcome back' : 'Create your scout account'}</h1><p className="mt-1 text-sm text-muted-foreground">{flow === 'signIn' ? 'Sign in with your username and password.' : 'Choose a username for your scouting account.'}</p>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <div className="grid gap-2"><Label htmlFor="username">Username</Label><Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" placeholder="team-scout" /></div>
        {flow === 'signUp' && <div className="grid gap-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" required maxLength={100} placeholder="Scout name" /></div>}
        <div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'} required minLength={8} placeholder="At least 8 characters" /></div>
        {flow === 'signUp' && <div className="grid gap-2"><Label htmlFor="confirmPassword">Confirm password</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} placeholder="Re-enter your password" /></div>}
        <Button type="submit" disabled={pending} className="mt-1 w-full">{pending ? 'Connecting…' : flow === 'signIn' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">{flow === 'signIn' ? 'New to the scouting workspace?' : 'Already have an account?'}{' '}<Button variant="link" className="h-auto p-0" onClick={() => setFlow(flow === 'signIn' ? 'signUp' : 'signIn')}>{flow === 'signIn' ? 'Create an account' : 'Sign in'}</Button></p>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">New accounts start with scout access. Administrator access is granted through the one-time Convex bootstrap setup.</p>
    </section>
  </main>
}

function SignOutButton() {
  const { signOut } = useAuthActions()
  return <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}><LogOut className="size-4" /></Button>
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
}
