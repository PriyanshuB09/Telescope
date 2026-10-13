import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { pickTier } from './schema'
import { requireAdmin, requireUser } from './lib/auth'

const MAX_EVENT_TEAMS = 500
const MAX_LIST_ENTRIES = 500
const MAX_SOURCE_LISTS = 50
const MAX_SNAPSHOT_ENTRIES = 10_000
const tiers = ['tier1', 'tier2', 'tier3', 'doNotPick', 'uncategorized'] as const
type PickTier = (typeof tiers)[number]
type UserContext = QueryCtx | MutationCtx
type PickEntryDoc = Doc<'personalPickListEntries'> | Doc<'primaryPickListEntries'>
type SourceInput = { personalListId: Id<'personalPickLists'> }
type MergeConfig = { tier1Weight: number; tier2Weight: number; tier3Weight: number; doNotPickWeight: number }

const configValidator = v.object({
  tier1Weight: v.number(),
  tier2Weight: v.number(),
  tier3Weight: v.number(),
  doNotPickWeight: v.number(),
})
const sourceValidator = v.object({ personalListId: v.id('personalPickLists') })
const entrySummaryValidator = v.object({
  eventTeamId: v.id('eventTeams'),
  teamNumber: v.number(),
  nickname: v.union(v.string(), v.null()),
  tier: pickTier,
  position: v.number(),
  pitScouted: v.boolean(),
  matchReportCount: v.number(),
  hasMoreReports: v.boolean(),
  sampleSize: v.number(),
  averageDriverRating: v.union(v.number(), v.null()),
  averageTeleopFuel: v.union(v.number(), v.null()),
  averageAutoFuel: v.union(v.number(), v.null()),
  averageTeleopTower: v.union(v.number(), v.null()),
})
const sourceVersionValidator = v.object({ personalListId: v.id('personalPickLists'), updatedAt: v.number() })
const mergeTeamValidator = v.object({
  eventTeamId: v.id('eventTeams'),
  teamNumber: v.number(),
  nickname: v.union(v.string(), v.null()),
  score: v.number(),
  averageNormalizedRank: v.number(),
  agreement: v.number(),
  tier1Count: v.number(),
  tier2Count: v.number(),
  tier3Count: v.number(),
  doNotPickCount: v.number(),
  uncategorizedCount: v.number(),
  recommendedTier: pickTier,
  position: v.number(),
})

function validateListName(name: string): string {
  const normalized = name.trim()
  if (!normalized || normalized.length > 80) throw new ConvexError('List name must be between 1 and 80 characters.')
  return normalized
}

function validateConfig(config: MergeConfig): void {
  const weights = [config.tier1Weight, config.tier2Weight, config.tier3Weight, config.doNotPickWeight]
  if (weights.some((weight) => !Number.isFinite(weight) || Math.abs(weight) > 1_000_000)) {
    throw new ConvexError('Merge weights must be finite values between -1,000,000 and 1,000,000.')
  }
  if (!(config.tier1Weight > config.tier2Weight && config.tier2Weight > config.tier3Weight && config.tier3Weight > 0 && config.doNotPickWeight < 0)) {
    throw new ConvexError('Weights must order Tier 1 above Tier 2 above Tier 3 above Uncategorized, with Do Not Pick below zero.')
  }
}

async function getEventTeams(ctx: UserContext, eventId: Id<'events'>): Promise<Doc<'eventTeams'>[]> {
  const teams = await ctx.db.query('eventTeams')
    .withIndex('by_event_id_and_team_number', (q) => q.eq('eventId', eventId))
    .take(MAX_EVENT_TEAMS + 1)
  if (teams.length > MAX_EVENT_TEAMS) throw new ConvexError(`This operation supports up to ${MAX_EVENT_TEAMS} event teams.`)
  return teams
}

async function getPersonalList(ctx: UserContext, listId: Id<'personalPickLists'>): Promise<Doc<'personalPickLists'>> {
  const list = await ctx.db.get(listId)
  if (!list) throw new ConvexError('Pick list not found.')
  return list
}

async function getEntryRows(ctx: UserContext, listId: Id<'personalPickLists'> | Id<'primaryPickLists'>, kind: 'personal' | 'primary'): Promise<PickEntryDoc[]> {
  const table = kind === 'personal' ? 'personalPickListEntries' : 'primaryPickListEntries'
  const entries = await ctx.db.query(table)
    .withIndex('by_list_position', (q) => q.eq('listId', listId))
    .take(MAX_LIST_ENTRIES + 1)
  if (entries.length > MAX_LIST_ENTRIES) throw new ConvexError(`This pick list has more than ${MAX_LIST_ENTRIES} entries and cannot be edited in one request.`)
  return entries
}

async function materializeEntries(ctx: UserContext, entries: PickEntryDoc[]): Promise<Array<{
  eventTeamId: Id<'eventTeams'>; teamNumber: number; nickname: string | null; tier: PickTier; position: number;
  pitScouted: boolean; matchReportCount: number; hasMoreReports: boolean; sampleSize: number;
  averageDriverRating: number | null; averageTeleopFuel: number | null; averageAutoFuel: number | null; averageTeleopTower: number | null
}>> {
  return await Promise.all(entries.map(async (entry) => {
    const team = await ctx.db.get(entry.eventTeamId)
    if (!team) return null
    const [pit, reports] = await Promise.all([
      ctx.db.query('pitScoutingReports').withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', team.eventId).eq('teamId', team._id)).first(),
      ctx.db.query('matchScoutingReports').withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', team.eventId).eq('teamId', team._id)).order('desc').take(51),
    ])
    const sample = reports.slice(0, 50)
    const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const towerValues = sample.flatMap((report) => report.teleopTower.finalObservedLevel === 'none' ? [] : [Number(report.teleopTower.finalObservedLevel.slice(-1))])
    return {
      eventTeamId: team._id, teamNumber: team.teamNumber, nickname: team.nickname ?? null, tier: entry.tier, position: entry.position,
      pitScouted: pit !== null, matchReportCount: sample.length, hasMoreReports: reports.length > 50, sampleSize: sample.length,
      averageDriverRating: avg(sample.map((report) => report.driverRating)),
      averageTeleopFuel: avg(sample.map((report) => report.teleop.fuelScored)),
      averageAutoFuel: avg(sample.map((report) => report.autonomous.fuelScored)),
      averageTeleopTower: avg(towerValues),
    }
  })).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null))
}

function tierWeight(tier: PickTier, config: MergeConfig): number {
  if (tier === 'tier1') return config.tier1Weight
  if (tier === 'tier2') return config.tier2Weight
  if (tier === 'tier3') return config.tier3Weight
  if (tier === 'doNotPick') return config.doNotPickWeight
  return 0
}

async function getMergeInputs(ctx: UserContext, eventId: Id<'events'>, sources: SourceInput[]) {
  if (sources.length === 0 || sources.length > MAX_SOURCE_LISTS) throw new ConvexError(`Select between 1 and ${MAX_SOURCE_LISTS} personal lists.`)
  const seen = new Set<string>()
  const sourceData: Array<{ list: Doc<'personalPickLists'>; entries: Doc<'personalPickListEntries'>[] }> = []
  let totalEntries = 0
  for (const source of sources) {
    if (seen.has(source.personalListId)) throw new ConvexError('A personal list may only be selected once.')
    seen.add(source.personalListId)
    const list = await getPersonalList(ctx, source.personalListId)
    if (list.eventId !== eventId) throw new ConvexError('Every selected personal list must belong to the selected event.')
    const entries = await getEntryRows(ctx, list._id, 'personal') as Doc<'personalPickListEntries'>[]
    totalEntries += entries.length
    if (totalEntries > MAX_SNAPSHOT_ENTRIES) throw new ConvexError(`Selected source lists exceed the ${MAX_SNAPSHOT_ENTRIES} entry merge limit.`)
    sourceData.push({ list, entries })
  }
  return sourceData
}

async function calculateMerge(ctx: UserContext, eventId: Id<'events'>, sourceData: Array<{ list: Doc<'personalPickLists'>; entries: Doc<'personalPickListEntries'>[] }>, config: MergeConfig) {
  const teams = await getEventTeams(ctx, eventId)
  const teamIds = new Set(teams.map((team) => String(team._id)))
  const records = new Map<string, Array<{ tier: PickTier; normalizedRank: number }>>()
  for (const { entries } of sourceData) {
    const valid = entries.filter((entry) => teamIds.has(String(entry.eventTeamId)))
    const grouped = new Map<PickTier, Doc<'personalPickListEntries'>[]>()
    for (const tier of tiers) grouped.set(tier, [])
    for (const entry of valid) grouped.get(entry.tier)?.push(entry)
    for (const group of grouped.values()) group.sort((a, b) => a.position - b.position || String(a.eventTeamId).localeCompare(String(b.eventTeamId)))
    for (const tier of tiers) {
      const group = grouped.get(tier) ?? []
      group.forEach((entry, rankIndex) => {
        const normalizedRank = group.length <= 1 ? 0.5 : rankIndex / (group.length - 1)
        const key = String(entry.eventTeamId)
        const values = records.get(key) ?? []
        values.push({ tier, normalizedRank })
        records.set(key, values)
      })
    }
  }

  const rows = teams.map((team) => {
    const preferences = records.get(String(team._id)) ?? []
    const counts: Record<PickTier, number> = { tier1: 0, tier2: 0, tier3: 0, doNotPick: 0, uncategorized: 0 }
    for (const pref of preferences) counts[pref.tier] += 1
    const score = preferences.length === 0 ? 0 : preferences.reduce((sum, pref) => {
      const base = tierWeight(pref.tier, config)
      if (pref.tier === 'uncategorized' || pref.tier === 'doNotPick') return sum + base
      const nextTierWeight = pref.tier === 'tier1' ? config.tier2Weight : pref.tier === 'tier2' ? config.tier3Weight : 0
      const rankInfluence = (base - nextTierWeight) * 0.1
      return sum + base + (1 - pref.normalizedRank) * rankInfluence
    }, 0) / preferences.length
    const ranked = preferences.filter((pref) => pref.tier !== 'uncategorized' && pref.tier !== 'doNotPick')
    const averageNormalizedRank = ranked.length === 0 ? 1 : ranked.reduce((sum, pref) => sum + pref.normalizedRank, 0) / ranked.length
    const agreement = preferences.length === 0 ? 0 : Math.max(...tiers.map((tier) => counts[tier])) / preferences.length
    let recommendedTier: PickTier = 'uncategorized'
    if (score > 0) {
      const tier1Boundary = (config.tier1Weight + config.tier2Weight) / 2
      const tier2Boundary = (config.tier2Weight + config.tier3Weight) / 2
      recommendedTier = score >= tier1Boundary ? 'tier1' : score >= tier2Boundary ? 'tier2' : 'tier3'
    } else if (preferences.length > 0 && counts.doNotPick > 0 && score < 0) {
      recommendedTier = 'doNotPick'
    }
    return {
      eventTeamId: team._id, teamNumber: team.teamNumber, nickname: team.nickname ?? null,
      score, averageNormalizedRank, agreement,
      tier1Count: counts.tier1, tier2Count: counts.tier2, tier3Count: counts.tier3,
      doNotPickCount: counts.doNotPick, uncategorizedCount: counts.uncategorized, recommendedTier,
    }
  })
  rows.sort((a, b) => b.score - a.score || a.averageNormalizedRank - b.averageNormalizedRank || a.teamNumber - b.teamNumber)
  return rows.map((row, index) => ({ ...row, position: index + 1 }))
}

export const listPickLists = query({
  args: { eventId: v.id('events') },
  returns: v.object({
    personal: v.array(v.object({ id: v.id('personalPickLists'), name: v.string(), updatedAt: v.number(), ownerId: v.id('users'), ownerName: v.union(v.string(), v.null()) })),
    primary: v.union(v.null(), v.object({ id: v.id('primaryPickLists'), name: v.string(), updatedAt: v.number(), hasManualChanges: v.boolean() })),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const lists = await ctx.db.query('personalPickLists').withIndex('by_owner_event', (q) => q.eq('ownerId', user._id).eq('eventId', args.eventId)).take(50)
    const personal = []
    for (const list of lists) {
      personal.push({ id: list._id, name: list.name, updatedAt: list.updatedAt, ownerId: list.ownerId, ownerName: user.name ?? null })
    }
    const primaryList = await ctx.db.query('primaryPickLists').withIndex('by_event', (q) => q.eq('eventId', args.eventId)).first()
    let primary = null
    if (primaryList) {
      primary = { id: primaryList._id, name: primaryList.name, updatedAt: primaryList.updatedAt, hasManualChanges: primaryList.hasManualChanges }
    }
    return { personal, primary }
  },
})

export const listMergeSources = query({
  args: { eventId: v.id('events') },
  returns: v.array(v.object({
    scoutId: v.id('users'), scoutName: v.union(v.string(), v.null()),
    lists: v.array(v.object({ id: v.id('personalPickLists'), name: v.string(), updatedAt: v.number() })),
  })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const lists = await ctx.db.query('personalPickLists').withIndex('by_event', (q) => q.eq('eventId', args.eventId)).take(500)
    const grouped = new Map<string, { user: Doc<'users'> | null; lists: Array<{ id: Id<'personalPickLists'>; name: string; updatedAt: number }> }>()
    for (const list of lists) {
      let group = grouped.get(String(list.ownerId))
      if (!group) {
        group = { user: await ctx.db.get(list.ownerId), lists: [] }
        grouped.set(String(list.ownerId), group)
      }
      group.lists.push({ id: list._id, name: list.name, updatedAt: list.updatedAt })
    }
    return Array.from(grouped, ([scoutId, group]) => ({ scoutId: scoutId as Id<'users'>, scoutName: group.user?.name ?? null, lists: group.lists }))
  },
})

export const getPersonalPickList = query({
  args: { listId: v.id('personalPickLists') },
  returns: v.object({ id: v.id('personalPickLists'), eventId: v.id('events'), name: v.string(), updatedAt: v.number(), entries: v.array(entrySummaryValidator) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const list = await getPersonalList(ctx, args.listId)
    if (list.ownerId !== user._id && user.role !== 'admin') throw new ConvexError('You can only open your own personal pick lists.')
    const entries = await getEntryRows(ctx, list._id, 'personal')
    const materialized = await materializeEntries(ctx, entries)
    materialized.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier) || a.position - b.position || a.teamNumber - b.teamNumber)
    return { id: list._id, eventId: list.eventId, name: list.name, updatedAt: list.updatedAt, entries: materialized }
  },
})

export const getPrimaryPickList = query({
  args: { eventId: v.id('events') },
  returns: v.union(v.null(), v.object({ id: v.id('primaryPickLists'), eventId: v.id('events'), name: v.string(), updatedAt: v.number(), hasManualChanges: v.boolean(), entries: v.array(entrySummaryValidator) })),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const list = await ctx.db.query('primaryPickLists').withIndex('by_event', (q) => q.eq('eventId', args.eventId)).first()
    if (!list) return null
    const entries = await getEntryRows(ctx, list._id, 'primary')
    const materialized = await materializeEntries(ctx, entries)
    materialized.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier) || a.position - b.position || a.teamNumber - b.teamNumber)
    return { id: list._id, eventId: list.eventId, name: list.name, updatedAt: list.updatedAt, hasManualChanges: list.hasManualChanges, entries: materialized }
  },
})

export const createPersonalPickList = mutation({
  args: { eventId: v.id('events'), name: v.string() },
  returns: v.id('personalPickLists'),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError('Event not found.')
    const name = validateListName(args.name)
    const teams = await getEventTeams(ctx, args.eventId)
    const now = Date.now()
    const listId = await ctx.db.insert('personalPickLists', { eventId: args.eventId, ownerId: user._id, name, createdAt: now, updatedAt: now })
    for (const [position, team] of teams.entries()) {
      await ctx.db.insert('personalPickListEntries', { listId, eventTeamId: team._id, tier: 'uncategorized', position, updatedAt: now })
    }
    return listId
  },
})

export const renamePersonalPickList = mutation({
  args: { listId: v.id('personalPickLists'), name: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const list = await getPersonalList(ctx, args.listId)
    if (list.ownerId !== user._id) throw new ConvexError('You can only rename your own personal pick lists.')
    await ctx.db.patch(list._id, { name: validateListName(args.name), updatedAt: Date.now() })
    return null
  },
})

export const deletePersonalPickList = mutation({
  args: { listId: v.id('personalPickLists') }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const list = await getPersonalList(ctx, args.listId)
    if (list.ownerId !== user._id) throw new ConvexError('You can only delete your own personal pick lists.')
    const entries = await getEntryRows(ctx, list._id, 'personal')
    for (const entry of entries) await ctx.db.delete(entry._id)
    await ctx.db.delete(list._id)
    return null
  },
})

export const movePersonalEntry = mutation({
  args: { listId: v.id('personalPickLists'), eventTeamId: v.id('eventTeams'), tier: pickTier, position: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const list = await getPersonalList(ctx, args.listId)
    if (list.ownerId !== user._id) throw new ConvexError('You can only edit your own personal pick lists.')
    if (!Number.isInteger(args.position) || args.position < 0 || args.position >= MAX_LIST_ENTRIES) throw new ConvexError('Position must be a valid zero-based list position.')
    const team = await ctx.db.get(args.eventTeamId)
    if (!team || team.eventId !== list.eventId) throw new ConvexError('Team does not belong to this pick list event.')
    const entries = await getEntryRows(ctx, list._id, 'personal') as Doc<'personalPickListEntries'>[]
    const entry = entries.find((row) => row.eventTeamId === team._id)
    const target = entries.filter((row) => row._id !== entry?._id && row.tier === args.tier).sort((a, b) => a.position - b.position)
    target.splice(Math.min(args.position, target.length), 0, entry ?? { _id: '' as Id<'personalPickListEntries'>, _creationTime: 0, listId: list._id, eventTeamId: team._id, tier: args.tier, position: 0, updatedAt: Date.now() })
    const now = Date.now()
    for (let position = 0; position < target.length; position += 1) {
      const row = target[position]
      if (row._id === '') await ctx.db.insert('personalPickListEntries', { listId: list._id, eventTeamId: team._id, tier: args.tier, position, updatedAt: now })
      else if (row.position !== position || row.tier !== args.tier) await ctx.db.patch(row._id, { tier: args.tier, position, updatedAt: now })
    }
    for (const tier of tiers) {
      if (tier === args.tier) continue
      const group = entries.filter((row) => row._id !== entry?._id && row.tier === tier).sort((a, b) => a.position - b.position)
      for (let position = 0; position < group.length; position += 1) if (group[position].position !== position) await ctx.db.patch(group[position]._id, { position, updatedAt: now })
    }
    await ctx.db.patch(list._id, { updatedAt: now })
    return null
  },
})

export const initializePrimaryPickList = mutation({
  args: { eventId: v.id('events'), name: v.optional(v.string()) }, returns: v.id('primaryPickLists'),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (!await ctx.db.get(args.eventId)) throw new ConvexError('Event not found.')
    const existing = await ctx.db.query('primaryPickLists').withIndex('by_event', (q) => q.eq('eventId', args.eventId)).first()
    if (existing) throw new ConvexError('The primary pick list has already been initialized for this event.')
    const now = Date.now()
    return await ctx.db.insert('primaryPickLists', { eventId: args.eventId, createdBy: admin._id, name: validateListName(args.name ?? 'Primary Pick List'), hasManualChanges: false, createdAt: now, updatedAt: now })
  },
})

export const setPrimaryEntry = mutation({
  args: { eventId: v.id('events'), eventTeamId: v.id('eventTeams'), tier: pickTier, position: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (!Number.isInteger(args.position) || args.position < 0 || args.position >= MAX_LIST_ENTRIES) throw new ConvexError('Position must be a valid zero-based list position.')
    const team = await ctx.db.get(args.eventTeamId)
    if (!team || team.eventId !== args.eventId) throw new ConvexError('Team does not belong to this event.')
    let list = await ctx.db.query('primaryPickLists').withIndex('by_event', (q) => q.eq('eventId', args.eventId)).first()
    if (!list) {
      const now = Date.now()
      const id = await ctx.db.insert('primaryPickLists', { eventId: args.eventId, createdBy: admin._id, name: 'Primary Pick List', hasManualChanges: false, createdAt: now, updatedAt: now })
      list = await ctx.db.get(id)
      if (!list) throw new ConvexError('Failed to initialize primary pick list.')
    }
    const entries = await getEntryRows(ctx, list._id, 'primary') as Doc<'primaryPickListEntries'>[]
    const current = entries.find((row) => row.eventTeamId === team._id)
    const target = entries.filter((row) => row._id !== current?._id && row.tier === args.tier).sort((a, b) => a.position - b.position)
    target.splice(Math.min(args.position, target.length), 0, current ?? { _id: '' as Id<'primaryPickListEntries'>, _creationTime: 0, listId: list._id, eventTeamId: team._id, tier: args.tier, position: 0, updatedAt: Date.now() })
    const now = Date.now()
    for (let position = 0; position < target.length; position += 1) {
      const row = target[position]
      if (row._id === '') await ctx.db.insert('primaryPickListEntries', { listId: list._id, eventTeamId: team._id, tier: args.tier, position, updatedAt: now })
      else if (row.position !== position || row.tier !== args.tier) await ctx.db.patch(row._id, { tier: args.tier, position, updatedAt: now })
    }
    for (const tier of tiers) {
      if (tier === args.tier) continue
      const group = entries.filter((row) => row._id !== current?._id && row.tier === tier).sort((a, b) => a.position - b.position)
      for (let position = 0; position < group.length; position += 1) if (group[position].position !== position) await ctx.db.patch(group[position]._id, { position, updatedAt: now })
    }
    await ctx.db.patch(list._id, { hasManualChanges: true, updatedAt: now })
    await ctx.db.insert('adminAuditLog', { actorId: admin._id, eventId: args.eventId, action: 'primary_pick_list_entry_changed', targetType: 'eventTeam', targetId: String(team._id), createdAt: now })
    return null
  },
})

export const previewMerge = query({
  args: { eventId: v.id('events'), sources: v.array(sourceValidator), config: configValidator },
  returns: v.object({ eventId: v.id('events'), sourceCount: v.number(), sourceVersions: v.array(sourceVersionValidator), rows: v.array(mergeTeamValidator) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    validateConfig(args.config)
    const sourceData = await getMergeInputs(ctx, args.eventId, args.sources)
    const rows = await calculateMerge(ctx, args.eventId, sourceData, args.config)
    return {
      eventId: args.eventId,
      sourceCount: sourceData.length,
      sourceVersions: sourceData.map(({ list }) => ({ personalListId: list._id, updatedAt: list.updatedAt })),
      rows,
    }
  },
})

export const applyMerge = mutation({
  args: {
    eventId: v.id('events'), sources: v.array(sourceValidator), config: configValidator,
    expectedSources: v.array(sourceVersionValidator), confirmed: v.boolean(), replaceManualChanges: v.boolean(),
  },
  returns: v.id('pickListMerges'),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (!args.confirmed) throw new ConvexError('Confirm the merge preview before applying it.')
    validateConfig(args.config)
    const sourceData = await getMergeInputs(ctx, args.eventId, args.sources)
    const expected = new Map(args.expectedSources.map((source) => [String(source.personalListId), source.updatedAt]))
    if (expected.size !== sourceData.length || sourceData.some(({ list }) => expected.get(String(list._id)) !== list.updatedAt)) {
      throw new ConvexError('A source list changed after the preview. Refresh the preview before applying the merge.')
    }
    const existingPrimary = await ctx.db.query('primaryPickLists').withIndex('by_event', (q) => q.eq('eventId', args.eventId)).first()
    if (existingPrimary?.hasManualChanges && !args.replaceManualChanges) throw new ConvexError('The primary list has manual edits. Confirm that you want to replace them.')
    const rows = await calculateMerge(ctx, args.eventId, sourceData, args.config)
    const now = Date.now()
    let primaryList = existingPrimary
    if (!primaryList) {
      const primaryId = await ctx.db.insert('primaryPickLists', { eventId: args.eventId, createdBy: admin._id, name: 'Primary Pick List', hasManualChanges: false, createdAt: now, updatedAt: now })
      primaryList = await ctx.db.get(primaryId)
      if (!primaryList) throw new ConvexError('Failed to initialize primary pick list.')
    }
    const oldEntries = await getEntryRows(ctx, primaryList._id, 'primary')
    for (const entry of oldEntries) await ctx.db.delete(entry._id)
    const perTierPosition: Record<PickTier, number> = { tier1: 0, tier2: 0, tier3: 0, doNotPick: 0, uncategorized: 0 }
    for (const row of rows) {
      const position = perTierPosition[row.recommendedTier]++
      await ctx.db.insert('primaryPickListEntries', { listId: primaryList._id, eventTeamId: row.eventTeamId, tier: row.recommendedTier, position, updatedAt: now })
    }
    const summary = `Merged ${sourceData.length} personal lists. Each explicit tier contributes its configured weight; ranked tiers add a 10% tier-gap bonus scaled by normalized in-tier rank (earlier ranks score higher). Uncategorized contributes 0, and Do Not Pick contributes ${args.config.doNotPickWeight}. Ties use average normalized in-tier rank, then team number.`
    const mergeId = await ctx.db.insert('pickListMerges', {
      eventId: args.eventId, primaryListId: primaryList._id, appliedBy: admin._id, appliedAt: now,
      sourceCount: sourceData.length, scoringConfig: args.config, summary, createdAt: now, updatedAt: now,
    })
    for (const { list, entries } of sourceData) {
      await ctx.db.insert('pickListMergeSources', { mergeId, scoutId: list.ownerId, personalListId: list._id, sourceName: list.name })
      for (const entry of entries) {
        await ctx.db.insert('pickListMergeSourceEntries', { mergeId, scoutId: list.ownerId, eventTeamId: entry.eventTeamId, tier: entry.tier, position: entry.position })
      }
    }
    for (const row of rows) {
      await ctx.db.insert('pickListMergeScores', {
        mergeId, eventTeamId: row.eventTeamId, score: row.score, averageNormalizedRank: row.averageNormalizedRank,
        agreement: row.agreement, tier1Count: row.tier1Count, tier2Count: row.tier2Count, tier3Count: row.tier3Count,
        doNotPickCount: row.doNotPickCount, uncategorizedCount: row.uncategorizedCount, recommendedTier: row.recommendedTier, position: row.position,
      })
    }
    await ctx.db.patch(primaryList._id, { hasManualChanges: false, updatedAt: now })
    await ctx.db.insert('adminAuditLog', { actorId: admin._id, eventId: args.eventId, action: 'pick_list_merge_applied', targetType: 'pickListMerge', targetId: String(mergeId), details: summary, createdAt: now })
    return mergeId
  },
})
