import { useAction, useQuery } from 'convex/react'
import { useState, type FormEvent } from 'react'
import { api } from '../../convex/_generated/api'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle2, CircleAlert, Download, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function EventSetupPage() {
  const event = useQuery(api.events.activeEvent)
  const importEvent = useAction(api.events.importEvent)
  const [eventKey, setEventKey] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    setPending(true)
    try {
      const result = await importEvent({ eventKey })
      if (result.status === 'failed') {
        toast.error(result.summary)
        return
      }
      toast.success(result.summary)
      setEventKey('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Event import failed.')
    } finally {
      setPending(false)
    }
  }

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-medium text-primary">Administration</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Event setup</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Import an FRC event from The Blue Alliance. Reimporting updates event data while preserving scouting reports.</p>
    </header>

    <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
      <form onSubmit={submit} className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Download className="size-5" /></span><div><h2 className="font-semibold">Import event</h2><p className="text-sm text-muted-foreground">Teams and qualification matches only</p></div></div>
        <div className="mt-5 grid gap-2"><Label htmlFor="event-key">TBA event key</Label><Input id="event-key" value={eventKey} onChange={(e) => setEventKey(e.target.value)} placeholder="2026nvlv" autoCapitalize="none" required pattern="[0-9]{4}[a-zA-Z0-9]{2,16}" /></div>
        <p className="mt-2 text-xs text-muted-foreground">Keep the TBA API key on the server: configure it with <code>bunx convex env set TBA_API_KEY …</code>.</p>
        <Button type="submit" className="mt-5 w-full sm:w-auto" disabled={pending || event === undefined}>
          {pending ? <><LoaderCircle className="mr-2 size-4 animate-spin" />Importing event…</> : 'Import event'}
        </Button>
      </form>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-muted"><CalendarDays className="size-5" /></span><div><h2 className="font-semibold">Current event</h2><p className="text-sm text-muted-foreground">Visible to your scouting team</p></div></div>
        {event === undefined ? <p className="mt-6 text-sm text-muted-foreground">Loading event…</p> : event ? <div className="mt-5 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{event.name} <span className="font-normal text-muted-foreground">({event.year})</span></h3><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${event.importStatus === 'complete' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}>{event.importStatus === 'complete' ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}{event.importStatus === 'complete' ? 'Imported' : 'Import failed'}</span></div>
          <p className="mt-1 text-sm text-muted-foreground">{[event.city, event.stateProv, event.country].filter(Boolean).join(', ') || event.tbaEventKey} · {event.tbaEventKey}</p>
          {event.importSummary && <p className="mt-4 rounded-md bg-muted p-3 text-sm">{event.importSummary}</p>}
          <p className="mt-3 text-xs text-muted-foreground">Last import {new Date(event.lastImportedAt).toLocaleString()}</p>
        </div> : <div className="mt-5 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No event imported yet. Import an event to make teams and the qualification schedule available.</div>}
      </section>
    </section>
  </div>
}
