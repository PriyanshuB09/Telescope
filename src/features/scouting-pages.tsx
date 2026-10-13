import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useMemo, useState, type FormEvent } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { toast } from 'sonner'
import { Activity, Check, ClipboardCheck, LoaderCircle, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Team = {
  _id: Id<'eventTeams'>
  teamNumber: number
  tbaTeamKey: string
  nickname: string | null
  city: string | null
  stateProv: string | null
  country: string | null
  pitScouted: boolean
  matchReportCount: number
}

const capabilityGroups = [
  { title: 'Fuel collection and scoring', keys: ['collectsFloor', 'collectsDepot', 'receivesHumanPlayer', 'scoresFuel', 'stationaryScoring', 'movingScoring', 'multiDistanceScoring'] },
  { title: 'Autonomous', keys: ['hasAutoRoutine', 'autoScoresFuel', 'autoCrossesCenter', 'autoLevel1Attempt', 'autoRepeatable'] },
  { title: 'Teleop', keys: ['teleopCollects', 'teleopScores', 'adaptsHubActivity', 'playsDefense', 'assistsPartners', 'hasStrategicRole'] },
  { title: 'Tower capability', keys: ['towerLevel1', 'towerLevel2', 'towerLevel3'] },
] as const

const capabilityLabels: Record<string, string> = {
  collectsFloor: 'Collects Fuel from floor', collectsDepot: 'Collects Fuel from Depot', receivesHumanPlayer: 'Receives Fuel from Human Player', scoresFuel: 'Scores Fuel into Hub', stationaryScoring: 'Scores while stationary', movingScoring: 'Scores while moving', multiDistanceScoring: 'Scores from different distances',
  hasAutoRoutine: 'Has autonomous routine', autoScoresFuel: 'Scores Fuel in autonomous', autoCrossesCenter: 'Crosses center line', autoLevel1Attempt: 'Can attempt autonomous Level 1', autoRepeatable: 'Autonomous is repeatable',
  teleopCollects: 'Collects consistently', teleopScores: 'Scores consistently', adaptsHubActivity: 'Adapts to Hub activity', playsDefense: 'Can play defense', assistsPartners: 'Assists alliance partners', hasStrategicRole: 'Has strategic role',
  towerLevel1: 'Can achieve Level 1', towerLevel2: 'Can achieve Level 2', towerLevel3: 'Can achieve Level 3',
}

export function TeamsPage() {
  const event = useQuery(api.events.activeEvent)
  const { results = [], status, loadMore } = usePaginatedQuery(api.scouting.listTeams, event ? { eventId: event.id } : 'skip', { initialNumItems: 100 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'scouted' | 'unscouted' | 'reports' | 'no-reports'>('all')
  const [teamId, setTeamId] = useState<Id<'eventTeams'> | null>(null)
  const filtered = useMemo(() => results.filter((team) => {
    const query = search.trim().toLowerCase()
    return (!query || String(team.teamNumber).includes(query) || team.nickname?.toLowerCase().includes(query)) && (filter === 'all' || (filter === 'scouted' ? team.pitScouted : filter === 'unscouted' ? !team.pitScouted : filter === 'reports' ? team.matchReportCount > 0 : team.matchReportCount === 0))
  }), [results, search, filter])
  return <div className="space-y-6">
    <PageHeading eyebrow={event?.name ?? 'Event workspace'} title="Teams" description="Find a robot, see its scouting status, and open the team record." />
    {!event && <EmptyState icon={<Users />} title="No active event" description="Ask an administrator to import an event before teams appear here." />}
    {event && <>
      <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by team number or nickname" aria-label="Search teams" /></div><div className="flex flex-wrap gap-2">{(['all', 'scouted', 'unscouted', 'reports', 'no-reports'] as const).map((value) => <Button key={value} variant={filter === value ? 'secondary' : 'outline'} size="sm" onClick={() => setFilter(value)}>{value === 'all' ? 'All teams' : value === 'scouted' ? 'Pit scouted' : value === 'unscouted' ? 'Not pit scouted' : value === 'reports' ? 'Has match reports' : 'No match reports'}</Button>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((team) => <TeamCard key={team._id} team={team} onClick={() => setTeamId(team._id)} />)}</div>
      {filtered.length === 0 && <EmptyState icon={<Search />} title="No matching teams" description="Try another search or change the scouting filter." />}
      {status === 'CanLoadMore' && <Button variant="outline" onClick={() => loadMore(100)} className="w-full">Load more teams</Button>}
      {status === 'LoadingMore' && <p className="text-center text-sm text-muted-foreground">Loading more teams…</p>}
    </>}
    <TeamDetailDialog teamId={teamId} open={teamId !== null} onOpenChange={(open) => { if (!open) setTeamId(null) }} />
  </div>
}

export function PitScoutingPage() {
  const event = useQuery(api.events.activeEvent)
  const { results = [], status, loadMore } = usePaginatedQuery(api.scouting.listTeams, event ? { eventId: event.id } : 'skip', { initialNumItems: 100 })
  const [search, setSearch] = useState('')
  const [teamId, setTeamId] = useState<Id<'eventTeams'> | null>(null)
  const filtered = results.filter((team) => (!search || String(team.teamNumber).includes(search) || team.nickname?.toLowerCase().includes(search.toLowerCase())))
  return <div className="space-y-6">
    <PageHeading eyebrow={event?.name ?? 'Event workspace'} title="Pit scouting" description="Quickly record a robot’s capabilities, construction, and reliability." />
    {!event ? <EmptyState icon={<ClipboardCheck />} title="No active event" description="An administrator needs to import the event first." /> : <>
      <div className="flex items-center gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a team" /></div><p className="text-sm text-muted-foreground">{results.filter((team) => team.pitScouted).length} scouted</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((team) => <TeamCard key={team._id} team={team} onClick={() => setTeamId(team._id)} action={team.pitScouted ? 'Edit report' : 'Start scouting'} />)}</div>
      {status === 'CanLoadMore' && <Button variant="outline" className="w-full" onClick={() => loadMore(100)}>Load more teams</Button>}
    </>}
    <PitReportDialog teamId={teamId} open={teamId !== null} onOpenChange={(open) => { if (!open) setTeamId(null) }} eventId={event?.id ?? null} />
  </div>
}

function TeamCard({ team, onClick, action = 'View team' }: { team: Team; onClick: () => void; action?: string }) {
  return <button type="button" onClick={onClick} className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-semibold tabular-nums">{team.teamNumber}</p><p className="mt-0.5 font-medium">{team.nickname || 'Team nickname unavailable'}</p><p className="mt-1 text-sm text-muted-foreground">{[team.city, team.stateProv].filter(Boolean).join(', ') || 'Location unavailable'}</p></div><span className={`mt-1 rounded-full px-2.5 py-1 text-xs font-medium ${team.pitScouted ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{team.pitScouted ? 'Pit scouted' : 'Not scouted'}</span></div>
    <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">{team.matchReportCount} match reports</span><span className="font-medium text-primary">{action} →</span></div>
  </button>
}

function TeamDetailDialog({ teamId, open, onOpenChange }: { teamId: Id<'eventTeams'> | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const detail = useQuery(api.scouting.getTeamDetail, teamId ? { teamId } : 'skip')
  const reports = [...(detail?.reports.filter(({ report }) => report.state === 'submitted') ?? [])].sort((a, b) => a.matchNumber - b.matchNumber)
  const average = (values: number[]) => values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '—'
  const autoAttempts = reports.filter(({ report }) => report.autonomous.level1Attempted).length
  const autoSuccesses = reports.filter(({ report }) => report.autonomous.level1Successful).length
  const towerAttempts = reports.reduce((sum, { report }) => sum + Number(report.teleopTower.level1Attempted) + Number(report.teleopTower.level2Attempted) + Number(report.teleopTower.level3Attempted), 0)
  const towerSuccesses = reports.reduce((sum, { report }) => sum + Number(report.teleopTower.level1Successful) + Number(report.teleopTower.level2Successful) + Number(report.teleopTower.level3Successful), 0)
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92svh] max-w-3xl overflow-y-auto p-0"><div className="p-5 sm:p-7"><DialogHeader><DialogTitle className="text-2xl">{detail?.team ? `${detail.team.teamNumber} · ${detail.team.nickname ?? 'Team'}` : 'Team details'}</DialogTitle><DialogDescription>{detail?.team ? [detail.team.city, detail.team.stateProv, detail.team.country, detail.team.tbaTeamKey].filter(Boolean).join(' · ') : 'Loading team record…'}</DialogDescription></DialogHeader>
    {detail && <div className="mt-6 space-y-6"><section><h3 className="font-semibold">Performance summary</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
      ['Matches scouted', String(reports.length)], ['Auto Fuel avg.', average(reports.map(({ report }) => report.autonomous.fuelScored))], ['Teleop Fuel avg.', average(reports.map(({ report }) => report.teleop.fuelScored))], ['Driver rating', average(reports.map(({ report }) => report.driverRating))], ['Defense rating', average(reports.map(({ report }) => report.defenseRating))], ['Auto L1 success', autoAttempts ? `${autoSuccesses}/${autoAttempts} attempts` : 'No attempts'], ['Teleop climb success', towerAttempts ? `${towerSuccesses}/${towerAttempts} attempts` : 'No attempts'], ['Total Fuel avg.', average(reports.map(({ report }) => report.autonomous.fuelScored + report.teleop.fuelScored))],
    ].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">n={reports.length}</p></div>)}</div></section>
    <section><h3 className="font-semibold">Pit scouting</h3>{detail.pitReport ? <div className="mt-3 space-y-3 rounded-lg border p-4"><div className="flex flex-wrap gap-2"><span className="rounded bg-muted px-2 py-1 text-sm capitalize">{detail.pitReport.drivetrain}</span>{detail.pitReport.tags.map((tag) => <span key={tag} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{tag.replaceAll('-', ' ')}</span>)}</div><div className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(detail.pitReport.capabilities).filter(([, enabled]) => enabled).map(([key]) => <p key={key} className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />{capabilityLabels[key]}</p>)}</div><div className="grid gap-3 text-sm sm:grid-cols-2">{[['Dimensions', detail.pitReport.dimensions], ['Intake design', detail.pitReport.intakeDesign], ['Scoring mechanism', detail.pitReport.scoringMechanism], ['Estimated Fuel capacity', detail.pitReport.estimatedFuelCapacity], ['Mobility', detail.pitReport.mobilityNotes], ['Mechanical features', detail.pitReport.mechanicalFeatures], ['Reliability', detail.pitReport.reliability ? `${detail.pitReport.reliability}/10` : undefined], ['Strengths', detail.pitReport.strengths], ['Weaknesses', detail.pitReport.weaknesses], ['Notes', detail.pitReport.notes]].filter(([, value]) => value).map(([label, value]) => <p key={label}><span className="text-muted-foreground">{label}: </span>{value}</p>)}</div><p className="text-xs text-muted-foreground">Updated {new Date(detail.pitReport.updatedAt).toLocaleString()}</p></div> : <p className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Not scouted yet.</p>}</section>
    <section><h3 className="font-semibold">Submitted match reports</h3>{reports.length ? <div className="mt-3 space-y-3">{reports.map(({ report, matchNumber, scoutName }) => <article key={report._id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><h4 className="font-medium">Qualification {matchNumber}</h4><span className="text-xs text-muted-foreground">{scoutName ?? 'Scout'} · {new Date(report.submittedAt ?? report.updatedAt).toLocaleString()}</span></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><p>Auto Fuel <strong>{report.autonomous.fuelScored}</strong></p><p>Teleop Fuel <strong>{report.teleop.fuelScored}</strong></p><p>Hub-active Fuel <strong>{report.teleop.fuelScoredHubActive ?? '—'}</strong></p><p>Driver <strong>{report.driverRating}/10</strong></p><p>Defense <strong>{report.defenseRating}/10</strong></p><p>Tower <strong>{report.teleopTower.finalObservedLevel}</strong> ({Number(report.teleopTower.level1Successful) + Number(report.teleopTower.level2Successful) + Number(report.teleopTower.level3Successful)} successful)</p></div><p className="mt-2 text-xs text-muted-foreground">{report.tags.map((tag) => tag.replaceAll('-', ' ')).join(' · ')}</p>{[report.autonomous.notes, report.teleop.notes, report.teleopTower.notes].filter(Boolean).map((note, index) => <p key={index} className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{note}</p>)}</article>)}</div> : <p className="mt-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No match reports yet.</p>}</section></div>}
  </div></DialogContent></Dialog>
}

function PitReportDialog({ teamId, eventId, open, onOpenChange }: { teamId: Id<'eventTeams'> | null; eventId: Id<'events'> | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const detail = useQuery(api.scouting.getTeamDetail, teamId ? { teamId } : 'skip')
  const save = useMutation(api.scouting.upsertPitReport)
  const [pending, setPending] = useState(false)
  const existing = detail?.pitReport
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!teamId || !eventId) return
    setPending(true)
    const form = new FormData(event.currentTarget)
    const capabilities = Object.fromEntries(capabilityGroups.flatMap(({ keys }) => keys.map((key) => [key, form.get(key) === 'on']))) as Record<string, boolean>
    try {
      await save({ eventId, teamId, fields: {
        capabilities: capabilities as never,
        drivetrain: String(form.get('drivetrain') ?? 'unknown') as 'swerve' | 'tank' | 'other' | 'unknown',
        dimensions: optional(form.get('dimensions')), intakeDesign: optional(form.get('intakeDesign')), scoringMechanism: optional(form.get('scoringMechanism')),
        estimatedFuelCapacity: optional(form.get('estimatedFuelCapacity')), mobilityNotes: optional(form.get('mobilityNotes')), mechanicalFeatures: optional(form.get('mechanicalFeatures')),
        reliability: optionalNumber(form.get('reliability')), strengths: optional(form.get('strengths')), weaknesses: optional(form.get('weaknesses')), notes: optional(form.get('notes')),
        tags: ['fuel-capable', 'strong-auto', 'reliable-climber', 'defensive-specialist', 'needs-follow-up'].filter((tag) => form.get(`tag-${tag}`) === 'on') as never,
      } })
      toast.success('Pit scouting saved.')
      onOpenChange(false)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save pit report.') } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94svh] max-w-3xl overflow-y-auto p-0"><div className="p-5 sm:p-7"><DialogHeader><DialogTitle>{detail?.team ? `Pit scouting · ${detail.team.teamNumber}` : 'Pit scouting report'}</DialogTitle><DialogDescription>Record observed capabilities. Leave unknown specifications blank.</DialogDescription></DialogHeader>{!detail ? <p className="py-8 text-sm text-muted-foreground">Loading team report…</p> : <form key={teamId} onSubmit={submit} className="mt-5 space-y-6">
    {capabilityGroups.map((group) => <fieldset key={group.title}><legend className="mb-3 font-semibold">{group.title}</legend><div className="grid gap-3 sm:grid-cols-2">{group.keys.map((key) => <CheckField key={key} name={key} label={capabilityLabels[key]} defaultChecked={existing?.capabilities[key] ?? false} />)}</div></fieldset>)}
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Drivetrain"><Select name="drivetrain" defaultValue={existing?.drivetrain ?? 'unknown'}><SelectTrigger className="w-full"><SelectValue placeholder="Choose drivetrain" /></SelectTrigger><SelectContent><SelectItem value="unknown">Unknown</SelectItem><SelectItem value="swerve">Swerve</SelectItem><SelectItem value="tank">Tank / differential</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></FormField>
    {[['dimensions', 'Dimensions or size'], ['intakeDesign', 'Intake design'], ['scoringMechanism', 'Scoring mechanism'], ['estimatedFuelCapacity', 'Estimated Fuel capacity'], ['mobilityNotes', 'Mobility / obstacles'], ['mechanicalFeatures', 'Mechanical features']].map(([name, label]) => <FormField key={name} name={name} label={label} defaultValue={existing?.[name as keyof typeof existing] as string | undefined} />)}</div>
    <fieldset><legend className="mb-3 font-semibold">Reliability and tags</legend><div className="grid gap-3 sm:grid-cols-2"><FormField name="reliability" label="Reliability (1–10)" type="number" min={1} max={10} defaultValue={existing?.reliability} />{['fuel-capable', 'strong-auto', 'reliable-climber', 'defensive-specialist', 'needs-follow-up'].map((tag) => <CheckField key={tag} name={`tag-${tag}`} label={tag.replaceAll('-', ' ')} defaultChecked={existing?.tags.includes(tag as never) ?? false} />)}</div></fieldset>
    <div className="grid gap-4 sm:grid-cols-2">{[['strengths', 'Strengths'], ['weaknesses', 'Potential weaknesses'], ['notes', 'Robot notes']].map(([name, label]) => <FormField key={name} name={name} label={label} asTextarea defaultValue={existing?.[name as keyof typeof existing] as string | undefined} />)}</div>
    <div className="flex items-center justify-between border-t pt-4"><p className="text-xs text-muted-foreground">{existing ? `Last saved ${new Date(existing.updatedAt).toLocaleString()}` : 'New report · changes save when submitted'}</p><Button type="submit" disabled={pending}>{pending && <LoaderCircle className="mr-2 size-4 animate-spin" />}{existing ? 'Save changes' : 'Submit pit report'}</Button></div>
    </form>}</div></DialogContent></Dialog>
}

function CheckField({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-normal"><Checkbox name={name} defaultChecked={defaultChecked} /> <span className="capitalize">{label}</span></Label>
}

function FormField({ name, label, defaultValue, type = 'text', min, max, asTextarea = false, children }: { name?: string; label: string; defaultValue?: string | number; type?: string; min?: number; max?: number; asTextarea?: boolean; children?: React.ReactNode }) {
  const id = name ?? label.toLowerCase().replaceAll(' ', '-')
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children ?? (asTextarea ? <Textarea id={id} name={name} defaultValue={defaultValue} rows={3} /> : <Input id={id} name={name} type={type} min={min} max={max} defaultValue={defaultValue} />)}</div>
}

export function MatchScoutingPage() {
  const event = useQuery(api.events.activeEvent)
  const { results = [], status, loadMore } = usePaginatedQuery(api.scouting.getSchedule, event ? { eventId: event.id } : 'skip', { initialNumItems: 50 })
  const claim = useMutation(api.scouting.claimAssignment)
  const [assignmentId, setAssignmentId] = useState<Id<'matchAssignments'> | null>(null)
  const [selected, setSelected] = useState<{ match: number; team: number } | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  async function start(matchId: Id<'matches'>, matchNumber: number, teamId: Id<'eventTeams'>, teamNumber: number) {
    const key = `${matchId}-${teamId}`
    setPendingKey(key)
    try {
      const response = await claim({ eventId: event!.id, matchId, teamId })
      setAssignmentId(response.assignmentId)
      setSelected({ match: matchNumber, team: teamNumber })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'This robot could not be assigned.') } finally { setPendingKey(null) }
  }
  return <div className="space-y-6">
    <PageHeading eyebrow={event?.name ?? 'Event workspace'} title="Match scouting" description="Choose a robot from the qualification schedule. Assignment is reserved before the report opens." />
    {!event ? <EmptyState icon={<Activity />} title="No active event" description="An administrator needs to import the qualification schedule first." /> : <>
      {results.map((match) => <section key={match._id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Qualification {match.matchNumber}</h2><p className="text-sm text-muted-foreground">{match.scheduledTime ? new Date(match.scheduledTime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Time TBD'}</p></div><div className="mt-4 grid gap-3 md:grid-cols-2">{([['Red', match.redTeams], ['Blue', match.blueTeams]] as const).map(([alliance, teams]) => <div key={alliance} className="rounded-lg border p-3"><p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${alliance === 'Red' ? 'text-red-600' : 'text-blue-600'}`}>{alliance} alliance</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{teams.map(({ team, assignmentState }) => <Button key={team._id} variant="outline" className="h-auto min-h-14 justify-start px-3 py-2" disabled={assignmentState !== 'unclaimed' || pendingKey !== null} onClick={() => void start(match._id, match.matchNumber, team._id, team.teamNumber)}><span><strong className="block">{team.teamNumber}</strong><span className="block max-w-28 truncate text-xs text-muted-foreground">{pendingKey === `${match._id}-${team._id}` ? 'Reserving…' : assignmentState === 'submitted' ? 'Report submitted' : assignmentState === 'claimed' ? 'Assigned' : team.nickname || 'Available'}</span></span></Button>)}</div></div>)}</div></section>)}
      {status === 'CanLoadMore' && <Button variant="outline" className="w-full" onClick={() => loadMore(50)}>Load more matches</Button>}
    </>}
    <MatchReportDialog assignmentId={assignmentId} selected={selected} onClose={() => { setAssignmentId(null); setSelected(null) }} />
  </div>
}

function MatchReportDialog({ assignmentId, selected, onClose }: { assignmentId: Id<'matchAssignments'> | null; selected: { match: number; team: number } | null; onClose: () => void }) {
  const submitReport = useMutation(api.scouting.submitMatchReport)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assignmentId) return
    setPending(true)
    const data = new FormData(event.currentTarget)
    const checked = (name: string) => data.get(name) === 'on'
    const number = (name: string) => Number(data.get(name) ?? 0)
    const tags = ['fast', 'accurate', 'good-driver', 'plays-defense', 'effective-collection', 'consistent-scorer', 'strong-auto', 'reliable-climber', 'failed-climb', 'inconsistent', 'broke-down', 'defensive-specialist', 'poor-mobility', 'needs-further-scouting'].filter((tag) => checked(`tag-${tag}`))
    const level1Attempted = checked('auto-level1-attempted')
    const level1Successful = checked('auto-level1-successful')
    const teleopTower = {
      level1Attempted: checked('tower-l1-attempted'), level1Successful: checked('tower-l1-successful'),
      level2Attempted: checked('tower-l2-attempted'), level2Successful: checked('tower-l2-successful'),
      level3Attempted: checked('tower-l3-attempted'), level3Successful: checked('tower-l3-successful'),
      finalObservedLevel: String(data.get('final-level') || 'none') as 'none' | 'level1' | 'level2' | 'level3',
      notes: optional(data.get('endgame-notes')),
    }
    try {
      await submitReport({ assignmentId, fields: {
        autonomous: { fuelScored: number('auto-fuel'), level1Attempted, level1Successful, centerLineCrossed: checked('center-line'), routineCompleted: checked('auto-complete'), notes: optional(data.get('auto-notes')) },
        teleop: { fuelScored: number('teleop-fuel'), fuelScoredHubActive: optionalNumber(data.get('active-fuel')), fuelAttemptedUnscored: optionalNumber(data.get('missed-fuel')), fuelConsistency: number('fuel-consistency'), collectionEffectiveness: number('collection-effectiveness'), defensiveActivity: checked('defensive'), notes: optional(data.get('teleop-notes')) },
        teleopTower, driverRating: number('driver-rating'), defenseRating: number('defense-rating'), reliabilityRating: optionalNumber(data.get('reliability-rating')), tags: tags as never,
      } })
      toast.success('Match report submitted.')
      onClose()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The report was not submitted.') } finally { setPending(false) }
  }
  return <Dialog open={assignmentId !== null} onOpenChange={(open) => { if (!open && !pending) onClose() }}><DialogContent className="max-h-[96svh] max-w-3xl overflow-y-auto p-0"><div className="p-5 sm:p-7"><DialogHeader><DialogTitle>Match report</DialogTitle><DialogDescription>{selected ? `Qualification ${selected.match} · Team ${selected.team}` : 'Record observed robot performance.'} · Your assignment is saved on the server.</DialogDescription></DialogHeader><form onSubmit={submit} className="mt-5 space-y-6">
    <fieldset className="rounded-xl border p-4"><legend className="px-1 font-semibold">Autonomous · 20 seconds</legend><div className="grid gap-4 sm:grid-cols-2"><FormField name="auto-fuel" label="Fuel scored" type="number" min={0} defaultValue={0} /><CheckField name="auto-level1-attempted" label="Level 1 climb attempted" /><CheckField name="auto-level1-successful" label="Level 1 climb successful" /><CheckField name="center-line" label="Crossed center line" /><CheckField name="auto-complete" label="Routine completed" /></div><div className="mt-4"><FormField name="auto-notes" label="Autonomous notes" asTextarea /></div></fieldset>
    <fieldset className="rounded-xl border p-4"><legend className="px-1 font-semibold">Teleop · 2:20</legend><div className="grid gap-4 sm:grid-cols-2"><FormField name="teleop-fuel" label="Total Fuel scored" type="number" min={0} defaultValue={0} /><FormField name="active-fuel" label="Scored while Hub active (optional)" type="number" min={0} /><FormField name="missed-fuel" label="Attempted but not scored" type="number" min={0} /><RatingField name="fuel-consistency" label="Fuel consistency" /><RatingField name="collection-effectiveness" label="Collection effectiveness" /><CheckField name="defensive" label="Played defense" /></div><div className="mt-4"><FormField name="teleop-notes" label="Teleop notes" asTextarea /></div></fieldset>
    <fieldset className="rounded-xl border p-4"><legend className="px-1 font-semibold">Tower · endgame</legend><div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3].map((level) => <div key={level} className="rounded-lg bg-muted/50 p-3"><p className="mb-2 text-sm font-medium">Level {level}</p><div className="grid gap-2"><CheckField name={`tower-l${level}-attempted`} label="Attempted" /><CheckField name={`tower-l${level}-successful`} label="Successful" /></div></div>)}<FormField name="final-level" label="Final observed level"><Select name="final-level" defaultValue="none"><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No climb / unknown</SelectItem><SelectItem value="level1">Level 1</SelectItem><SelectItem value="level2">Level 2</SelectItem><SelectItem value="level3">Level 3</SelectItem></SelectContent></Select></FormField></div><div className="mt-4"><FormField name="endgame-notes" label="Endgame notes" asTextarea /></div></fieldset>
    <fieldset className="rounded-xl border p-4"><legend className="px-1 font-semibold">Ratings and tags</legend><div className="grid gap-4 sm:grid-cols-3"><RatingField name="driver-rating" label="Driver rating" /><RatingField name="defense-rating" label="Defense rating" /><RatingField name="reliability-rating" label="Reliability (optional)" optional /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{['fast', 'accurate', 'good-driver', 'plays-defense', 'effective-collection', 'consistent-scorer', 'strong-auto', 'reliable-climber', 'failed-climb', 'inconsistent', 'broke-down', 'defensive-specialist', 'poor-mobility', 'needs-further-scouting'].map((tag) => <CheckField key={tag} name={`tag-${tag}`} label={tag.replaceAll('-', ' ')} />)}</div></fieldset>
    <div className="sticky bottom-0 flex justify-end border-t bg-background/95 py-3"><Button type="submit" size="lg" disabled={pending}>{pending && <LoaderCircle className="mr-2 size-4 animate-spin" />}{pending ? 'Submitting…' : 'Submit report'}</Button></div>
    </form></div></DialogContent></Dialog>
}

function RatingField({ name, label, optional = false }: { name: string; label: string; optional?: boolean }) {
  return <FormField name={name} label={label}><Select name={name} defaultValue={optional ? 'skip' : '5'}><SelectTrigger className="w-full"><SelectValue placeholder={optional ? 'Skip' : 'Choose 1–10'} /></SelectTrigger><SelectContent>{optional && <SelectItem value="skip">Skip</SelectItem>}{Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField>
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header><p className="text-sm font-medium text-primary">{eyebrow}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{description}</p></header>
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-card p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">{icon}</span><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p></div></div>
}

function optional(value: FormDataEntryValue | null) { const text = String(value ?? '').trim(); return text || undefined }
function optionalNumber(value: FormDataEntryValue | null) { const text = String(value ?? '').trim(); return text && text !== 'skip' ? Number(text) : undefined }
