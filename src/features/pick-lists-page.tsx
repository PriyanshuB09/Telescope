import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const tiers = [
  { id: 'tier1', label: 'Tier 1', hint: 'Top alliance targets', color: 'border-emerald-500/35' },
  { id: 'tier2', label: 'Tier 2', hint: 'Strong partners', color: 'border-blue-500/35' },
  { id: 'tier3', label: 'Tier 3', hint: 'Situational options', color: 'border-amber-500/35' },
  { id: 'doNotPick', label: 'Do Not Pick', hint: 'Explicit negative signal', color: 'border-destructive/35' },
  { id: 'uncategorized', label: 'Uncategorized', hint: 'Not yet evaluated', color: 'border-border' },
] as const
type Tier = (typeof tiers)[number]['id']
type Entry = { eventTeamId: Id<'eventTeams'>; teamNumber: number; nickname: string | null; tier: Tier; position: number; pitScouted?: boolean; matchReportCount?: number; hasMoreReports?: boolean; sampleSize?: number; averageDriverRating?: number | null; averageTeleopFuel?: number | null; averageAutoFuel?: number | null; averageTeleopTower?: number | null }
type PersonalList = { id: Id<'personalPickLists'>; name: string; updatedAt: number; ownerId: Id<'users'>; ownerName: string | null }
const defaultConfig = { tier1Weight: 100, tier2Weight: 60, tier3Weight: 25, doNotPickWeight: -100 }

export function PickListsPage() {
  const event = useQuery(api.events.activeEvent)
  const user = useQuery(api.users.currentUser)
  const summary = useQuery(api.pickLists.listPickLists, event ? { eventId: event.id } : 'skip')
  const { results: teams = [] } = usePaginatedQuery(api.scouting.listTeams, event ? { eventId: event.id } : 'skip', { initialNumItems: 100 })
  const [selectedListId, setSelectedListId] = useState<Id<'personalPickLists'> | null>(null)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)
  const createList = useMutation(api.pickLists.createPersonalPickList)
  const deleteList = useMutation(api.pickLists.deletePersonalPickList)
  const initPrimary = useMutation(api.pickLists.initializePrimaryPickList)
  const personal = summary?.personal ?? []
  const selected = personal.find((list) => list.id === selectedListId) ?? personal[0] ?? null

  async function create() {
    if (!event) return
    setCreating(true)
    try { const listId = await createList({ eventId: event.id, name: newListName }); setSelectedListId(listId); setNewListName(''); toast.success('Pick list created.') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create pick list.') }
    finally { setCreating(false) }
  }
  async function removeSelected() {
    if (!selected || !window.confirm(`Delete “${selected.name}” and its rankings? This cannot be undone.`)) return
    try { await deleteList({ listId: selected.id }); setSelectedListId(null); toast.success('Pick list deleted.') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete pick list.') }
  }
  async function initialize() {
    if (!event) return
    try { await initPrimary({ eventId: event.id }); toast.success('Blank primary pick list initialized.') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not initialize primary pick list.') }
  }

  if (!event) return <Empty title="No active event" description="Import an event before creating pick lists." />
  if (!user || !summary) return <p className="text-sm text-muted-foreground">Loading pick lists…</p>
  return <div className="space-y-6">
    <header><p className="text-sm font-medium text-primary">{event.name}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Pick lists</h1><p className="mt-2 max-w-2xl text-muted-foreground">Rank teams for alliance selection. Personal lists stay private to their scout; the primary list is admin-controlled.</p></header>
    <Tabs defaultValue="personal">
      <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit"><TabsTrigger value="personal">My lists ({personal.length})</TabsTrigger><TabsTrigger value="primary">Primary list</TabsTrigger></TabsList>
      <TabsContent value="personal" className="mt-5 space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end"><div className="grid flex-1 gap-2"><Label htmlFor="new-list-name">Create a personal list</Label><Input id="new-list-name" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="e.g. Offensive partners" maxLength={80} /></div><Button onClick={() => void create()} disabled={creating || !newListName.trim()}><Plus className="mr-2 size-4" />Create list</Button></div>
        {personal.length > 0 && <div className="flex flex-wrap items-center gap-2"><Select value={selected?.id ?? ''} onValueChange={(value) => setSelectedListId(value as Id<'personalPickLists'>)}><SelectTrigger className="min-w-52"><SelectValue placeholder="Choose a list" /></SelectTrigger><SelectContent>{personal.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">Updated {selected ? new Date(selected.updatedAt).toLocaleString() : ''}</span><Button variant="outline" size="sm" onClick={() => void removeSelected()} disabled={!selected}><Trash2 className="mr-2 size-4" />Delete</Button></div>}
        {selected ? <PersonalBoard key={selected.id} list={selected} allTeams={teams} /> : <Empty title="Create your first list" description="Each list starts with every event team in Uncategorized. Make another list whenever your strategy changes." />}
      </TabsContent>
      <TabsContent value="primary" className="mt-5 space-y-5">
        {summary.primary ? <PrimaryBoard eventId={event.id} allTeams={teams} isAdmin={user.role === 'admin'} /> : <div className="rounded-xl border border-dashed bg-card p-8 text-center"><ShieldCheck className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">Primary list not initialized</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">An admin can create a blank primary list. It will not copy any scout’s rankings.</p>{user.role === 'admin' && <Button className="mt-4" onClick={() => void initialize()}>Initialize blank primary list</Button>}</div>}
      </TabsContent>
    </Tabs>
    {user.role === 'admin' && <MergeTool eventId={event.id} primaryHasManualChanges={summary.primary?.hasManualChanges ?? false} />}
  </div>
}

function PersonalBoard({ list, allTeams }: { list: PersonalList; allTeams: Array<{ _id: Id<'eventTeams'>; teamNumber: number; nickname: string | null; pitScouted: boolean; matchReportCount: number }> }) {
  const full = useQuery(api.pickLists.getPersonalPickList, { listId: list.id })
  const move = useMutation(api.pickLists.movePersonalEntry)
  const rename = useMutation(api.pickLists.renamePersonalPickList)
  const [name, setName] = useState(list.name)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const entries = full?.entries ?? []
  const unlisted = allTeams.filter((team) => !entries.some((entry) => entry.eventTeamId === team._id)).map((team) => ({ eventTeamId: team._id, teamNumber: team.teamNumber, nickname: team.nickname, tier: 'uncategorized' as const, position: entries.filter((entry) => entry.tier === 'uncategorized').length, pitScouted: team.pitScouted, matchReportCount: team.matchReportCount, hasMoreReports: false, sampleSize: 0, averageDriverRating: null, averageTeleopFuel: null, averageAutoFuel: null, averageTeleopTower: null }))
  const everyEntry = [...entries, ...unlisted]
  const normalized = everyEntry.map((entry, index) => ({ ...entry, position: entry.position + index / 10000 }))
  async function saveName() {
    if (!name.trim() || name === list.name) return
    try { await rename({ listId: list.id, name }); toast.success('List renamed.') } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not rename list.') }
  }
  async function moveEntry(teamId: Id<'eventTeams'>, tier: Tier, position: number) {
    setSaving(true)
    try { await move({ listId: list.id, eventTeamId: teamId, tier, position }); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not move team. Your saved list is unchanged.') }
    finally { setSaving(false) }
  }
  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const activeId = String(event.active.id) as Id<'eventTeams'>
    const overId = String(event.over.id)
    const active = everyEntry.find((entry) => entry.eventTeamId === activeId)
    if (!active) return
    const targetTier = tiers.find((tier) => tier.id === overId)?.id ?? everyEntry.find((entry) => entry.eventTeamId === overId as Id<'eventTeams'>)?.tier ?? active.tier
    const targetGroup = everyEntry.filter((entry) => entry.tier === targetTier && entry.eventTeamId !== activeId).sort((a, b) => a.position - b.position)
    const overIndex = targetGroup.findIndex((entry) => entry.eventTeamId === overId)
    void moveEntry(activeId, targetTier, overIndex >= 0 ? overIndex : targetGroup.length)
  }
  const filteredBySearch = useMemo(() => normalized.filter((entry) => !search || String(entry.teamNumber).includes(search) || entry.nickname?.toLowerCase().includes(search.toLowerCase())), [normalized, search])
  return <section className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="grid flex-1 gap-2"><Label htmlFor="rename-list">List name</Label><Input id="rename-list" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void saveName()} maxLength={80} /></div><div className="relative flex-1"><Label htmlFor="filter-teams" className="sr-only">Filter teams</Label><Input id="filter-teams" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter teams" /></div>{saving && <span className="text-xs text-muted-foreground">Saving…</span>}</div>
    {!full ? <p className="text-sm text-muted-foreground">Loading saved rankings…</p> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><div className="grid gap-3 xl:grid-cols-5">{tiers.map((tier) => <TierColumn key={tier.id} tier={tier} entries={filteredBySearch.filter((entry) => entry.tier === tier.id).sort((a, b) => a.position - b.position)} move={moveEntry} />)}</div></DndContext>}
    <p className="text-xs text-muted-foreground">Drag teams between columns. Use the up/down controls for precise ordering on a phone.</p>
  </section>
}

function PrimaryBoard({ eventId, allTeams, isAdmin }: { eventId: Id<'events'>; allTeams: Array<{ _id: Id<'eventTeams'>; teamNumber: number; nickname: string | null; pitScouted: boolean; matchReportCount: number }>; isAdmin: boolean }) {
  const primary = useQuery(api.pickLists.getPrimaryPickList, { eventId })
  const setEntry = useMutation(api.pickLists.setPrimaryEntry)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const entries = primary?.entries ?? []
  const unlisted = allTeams.filter((team) => !entries.some((entry) => entry.eventTeamId === team._id)).map((team) => ({ eventTeamId: team._id, teamNumber: team.teamNumber, nickname: team.nickname, tier: 'uncategorized' as const, position: entries.filter((entry) => entry.tier === 'uncategorized').length, pitScouted: team.pitScouted, matchReportCount: team.matchReportCount, hasMoreReports: false, sampleSize: 0, averageDriverRating: null, averageTeleopFuel: null, averageAutoFuel: null, averageTeleopTower: null }))
  const everyEntry = [...entries, ...unlisted]
  async function move(teamId: Id<'eventTeams'>, tier: Tier, position: number) {
    try { await setEntry({ eventId, eventTeamId: teamId, tier, position }); toast.success('Primary list updated.') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update primary list.') }
  }
  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return
    const activeId = String(event.active.id) as Id<'eventTeams'>
    const overId = String(event.over.id)
    const active = everyEntry.find((entry) => entry.eventTeamId === activeId)
    if (!active) return
    const targetTier = tiers.find((tier) => tier.id === overId)?.id ?? everyEntry.find((entry) => entry.eventTeamId === overId as Id<'eventTeams'>)?.tier ?? active.tier
    const targetGroup = everyEntry.filter((entry) => entry.tier === targetTier && entry.eventTeamId !== activeId).sort((a, b) => a.position - b.position)
    const overIndex = targetGroup.findIndex((entry) => entry.eventTeamId === overId)
    void move(activeId, targetTier, overIndex >= 0 ? overIndex : targetGroup.length)
  }
  return <section className="space-y-4"><div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4"><ShieldCheck className="size-5 text-primary" /><div className="flex-1"><p className="font-medium">{primary?.name ?? 'Primary Pick List'}</p><p className="text-xs text-muted-foreground">{isAdmin ? 'Admin edits are saved immediately.' : 'Read-only view.'}</p></div><span className="text-xs text-muted-foreground">{entries.length} ranked · {primary ? new Date(primary.updatedAt).toLocaleString() : 'Loading…'}</span></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><div className="grid gap-3 xl:grid-cols-5">{tiers.map((tier) => <TierColumn key={tier.id} tier={tier} entries={everyEntry.filter((entry) => entry.tier === tier.id).sort((a, b) => a.position - b.position)} move={move} readOnly={!isAdmin} />)}</div></DndContext></section>
}

function TierColumn({ tier, entries, move, readOnly = false }: { tier: (typeof tiers)[number]; entries: Entry[]; move: (teamId: Id<'eventTeams'>, tier: Tier, position: number) => void; readOnly?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: tier.id, disabled: readOnly })
  return <section ref={setNodeRef} className={`min-h-48 rounded-xl border-t-2 ${tier.color} ${isOver ? 'bg-primary/5' : 'bg-muted/35'} p-3`}><header className="mb-3"><h3 className="font-semibold">{tier.label}<span className="ml-2 text-xs font-normal text-muted-foreground">{entries.length}</span></h3><p className="text-xs text-muted-foreground">{tier.hint}</p></header><div className="grid gap-2">{entries.map((entry, index) => <TeamRankCard key={entry.eventTeamId} entry={entry} tier={tier.id} index={index} count={entries.length} move={move} readOnly={readOnly} />)}{entries.length === 0 && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Drop teams here</p>}</div></section>
}

function TeamRankCard({ entry, tier, index, count, move, readOnly }: { entry: Entry; tier: Tier; index: number; count: number; move: (teamId: Id<'eventTeams'>, tier: Tier, position: number) => void; readOnly: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: entry.eventTeamId, disabled: readOnly })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return <article ref={setNodeRef} style={style} className={`rounded-lg border bg-card p-3 shadow-sm ${isDragging ? 'z-10 opacity-50' : ''}`}><div className="flex items-start gap-2"><button type="button" {...listeners} {...attributes} className={`mt-0.5 rounded p-1 text-muted-foreground ${readOnly ? 'hidden' : 'cursor-grab touch-none hover:bg-muted'}`} aria-label={`Drag team ${entry.teamNumber}`}><GripVertical className="size-4" /></button><div className="min-w-0 flex-1"><p className="font-semibold tabular-nums">{entry.teamNumber}</p><p className="truncate text-xs text-muted-foreground">{entry.nickname || 'Team nickname unavailable'}</p></div></div><div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 border-t pt-2 text-[11px]"><span className={entry.pitScouted ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}>{entry.pitScouted ? 'Pit scouted' : 'Pit not scouted'}</span><span className="text-right text-muted-foreground">{entry.matchReportCount ?? 0}{entry.hasMoreReports ? '+' : ''} match reports</span><span>Driver {formatMetric(entry.averageDriverRating)}</span><span>Teleop Fuel {formatMetric(entry.averageTeleopFuel)} <span className="text-muted-foreground">n={entry.sampleSize ?? 0}</span></span><span>Auto Fuel {formatMetric(entry.averageAutoFuel)}</span><span>Tower {formatMetric(entry.averageTeleopTower)}</span></div><div className="mt-2 flex justify-between border-t pt-2">{readOnly ? <span className="text-xs text-muted-foreground">Position {index + 1}</span> : <><Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(entry.eventTeamId, tier, index - 1)}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === count - 1} onClick={() => move(entry.eventTeamId, tier, index + 1)}><ArrowDown /></Button><Select value={tier} onValueChange={(value) => move(entry.eventTeamId, value as Tier, 0)}><SelectTrigger className="h-8 w-32" aria-label="Move team to tier"><SelectValue /></SelectTrigger><SelectContent>{tiers.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></>}</div></article>
}

function MergeTool({ eventId, primaryHasManualChanges }: { eventId: Id<'events'>; primaryHasManualChanges: boolean }) {
  const sources = useQuery(api.pickLists.listMergeSources, { eventId })
  const [selectedIds, setSelectedIds] = useState<Id<'personalPickLists'>[]>([])
  const [weights, setWeights] = useState(defaultConfig)
  const [confirmed, setConfirmed] = useState(false)
  const [replaceManualChanges, setReplaceManualChanges] = useState(false)
  const [pending, setPending] = useState(false)
  const preview = useQuery(api.pickLists.previewMerge, selectedIds.length ? { eventId, sources: selectedIds.map((personalListId) => ({ personalListId })), config: weights } : 'skip')
  const apply = useMutation(api.pickLists.applyMerge)
  const toggle = (id: Id<'personalPickLists'>, checked: boolean) => setSelectedIds((ids) => checked ? [...ids, id] : ids.filter((entry) => entry !== id))
  async function applyResult() {
    if (!preview || !confirmed) return
    setPending(true)
    try {
      await apply({ eventId, sources: selectedIds.map((personalListId) => ({ personalListId })), config: weights, expectedSources: preview.sourceVersions, confirmed: true, replaceManualChanges })
      toast.success('Consensus recommendations applied to the primary list.')
      setConfirmed(false); setReplaceManualChanges(false)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The merge was not applied. Refresh the preview and try again.') }
    finally { setPending(false) }
  }
  return <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><RefreshCw className="size-5" /></span><div><h2 className="font-semibold">Consensus merge</h2><p className="mt-1 text-sm text-muted-foreground">Select scout lists, preview agreement, then confirm before updating the primary list.</p></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4"><div className="grid gap-2"><h3 className="text-sm font-medium">Source lists</h3>{sources?.length ? sources.flatMap((scout) => scout.lists.map((list) => <Label key={list.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-normal"><Checkbox checked={selectedIds.includes(list.id)} onCheckedChange={(checked) => toggle(list.id, checked === true)} /><span className="flex-1"><span className="block font-medium">{list.name}</span><span className="text-xs text-muted-foreground">{scout.scoutName ?? 'Scout'} · {new Date(list.updatedAt).toLocaleDateString()}</span></span></Label>)) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No personal lists are available to merge.</p>}</div>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Consensus weights</summary><p className="mt-1 text-xs text-muted-foreground">Uncategorized scores zero. Do Not Pick is a negative preference. Within-tier rank adds a small deterministic bonus.</p><div className="mt-3 grid grid-cols-2 gap-2">{([['tier1Weight', 'Tier 1'], ['tier2Weight', 'Tier 2'], ['tier3Weight', 'Tier 3'], ['doNotPickWeight', 'Do not pick']] as const).map(([key, label]) => <div key={key} className="grid gap-1"><Label htmlFor={key} className="text-xs">{label}</Label><Input id={key} type="number" value={weights[key]} onChange={(e) => setWeights((value) => ({ ...value, [key]: Number(e.target.value) }))} /></div>)}</div></details></div>
      <div className="min-w-0"><h3 className="text-sm font-medium">Preview {preview ? `· ${preview.sourceCount} lists` : ''}</h3>{preview ? <div className="mt-2 max-h-96 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted text-xs"><tr><th className="px-3 py-2">Team</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Tier</th><th className="px-3 py-2">Agreement</th><th className="px-3 py-2">Votes 1/2/3/DNP</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.eventTeamId} className="border-t"><td className="px-3 py-2 font-medium">{row.teamNumber} <span className="block max-w-28 truncate text-xs font-normal text-muted-foreground">{row.nickname}</span></td><td className="px-3 py-2 tabular-nums">{row.score.toFixed(1)}</td><td className="px-3 py-2">{tiers.find((tier) => tier.id === row.recommendedTier)?.label}</td><td className="px-3 py-2">{Math.round(row.agreement * 100)}%</td><td className="px-3 py-2 tabular-nums">{row.tier1Count}/{row.tier2Count}/{row.tier3Count}/{row.doNotPickCount}</td></tr>)}</tbody></table></div> : <p className="mt-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Choose one or more personal lists to calculate the recommendation.</p>}</div>
    </div>
    {primaryHasManualChanges && <Label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm font-normal"><Checkbox checked={replaceManualChanges} onCheckedChange={(checked) => setReplaceManualChanges(checked === true)} />The primary list has manual edits. Replace them with the consensus ordering.</Label>}
    <Label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm font-normal"><Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><span>I reviewed the preview and authorize replacing the primary list ordering. This is a recommendation, not an objectively optimal ranking.</span></Label>
    <div className="mt-3 flex justify-end"><Button disabled={!preview || !confirmed || (primaryHasManualChanges && !replaceManualChanges) || pending} onClick={() => void applyResult()}>{pending ? 'Applying…' : 'Apply consensus to primary list'}</Button></div>
  </section>
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-dashed bg-card p-8 text-center"><ListOrdered className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div>
}

function formatMetric(value: number | null | undefined) { return value === null || value === undefined ? '—' : value.toFixed(1) }
