import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { requireAdmin, requireUser } from './lib/auth'
import {
  fetchTbaJson,
  parseTbaEvent,
  parseTbaQualificationMatches,
  parseTbaTeams,
} from './lib/tba'
import { env } from './_generated/server'
import { ConvexError, v } from 'convex/values'
import type { Id } from './_generated/dataModel'

const tbaEventValidator = v.object({
  key: v.string(),
  name: v.string(),
  year: v.number(),
  city: v.optional(v.string()),
  stateProv: v.optional(v.string()),
  country: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
})

const tbaTeamValidator = v.object({
  key: v.string(),
  teamNumber: v.number(),
  nickname: v.optional(v.string()),
  city: v.optional(v.string()),
  stateProv: v.optional(v.string()),
  country: v.optional(v.string()),
})

const tbaMatchValidator = v.object({
  key: v.string(),
  matchNumber: v.number(),
  time: v.optional(v.number()),
  redTeamKeys: v.array(v.string()),
  blueTeamKeys: v.array(v.string()),
})

const eventReturnValidator = v.union(
  v.null(),
  v.object({
    id: v.id('events'),
    tbaEventKey: v.string(),
    name: v.string(),
    year: v.number(),
    city: v.union(v.string(), v.null()),
    stateProv: v.union(v.string(), v.null()),
    country: v.union(v.string(), v.null()),
    startDate: v.union(v.string(), v.null()),
    endDate: v.union(v.string(), v.null()),
    isActive: v.boolean(),
    importStatus: v.union(v.literal('complete'), v.literal('failed')),
    importSummary: v.union(v.string(), v.null()),
    lastImportedAt: v.number(),
  }),
)

function validateEventKey(value: string): { key: string; year: number } {
  const key = value.trim().toLowerCase()
  if (!/^\d{4}[a-z0-9]{2,16}$/.test(key)) {
    throw new ConvexError('Enter a valid TBA event key, such as 2026nvlv.')
  }
  return { key, year: Number(key.slice(0, 4)) }
}

export const activeEvent = query({
  args: {},
  returns: eventReturnValidator,
  handler: async (ctx) => {
    await requireUser(ctx)
    const event = await ctx.db.query('events').withIndex('by_active', (q) => q.eq('isActive', true)).first()
    if (!event) return null
    return {
      id: event._id,
      tbaEventKey: event.tbaEventKey,
      name: event.name,
      year: event.year,
      city: event.city ?? null,
      stateProv: event.stateProv ?? null,
      country: event.country ?? null,
      startDate: event.startDate ?? null,
      endDate: event.endDate ?? null,
      isActive: event.isActive,
      importStatus: event.importStatus,
      importSummary: event.importSummary ?? null,
      lastImportedAt: event.lastImportedAt,
    }
  },
})

export const requireAdminActor = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx)
    return admin._id
  },
})

export const persistImport = internalMutation({
  args: {
    event: tbaEventValidator,
    teams: v.array(tbaTeamValidator),
    matches: v.array(tbaMatchValidator),
  },
  returns: v.object({ eventId: v.id('events'), teamCount: v.number(), matchCount: v.number(), summary: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const now = Date.now()
    const existingEvent = await ctx.db.query('events')
      .withIndex('by_tba_event_key', (q) => q.eq('tbaEventKey', args.event.key))
      .unique()

    // There should be only one active event. The index lookup is deliberately bounded
    // in case inconsistent data contains more than one active row.
    const activeEvents = await ctx.db.query('events')
      .withIndex('by_active', (q) => q.eq('isActive', true))
      .take(10)
    for (const active of activeEvents) {
      if (active._id !== existingEvent?._id) await ctx.db.patch(active._id, { isActive: false, updatedAt: now })
    }

    const eventFields = {
      tbaEventKey: args.event.key,
      name: args.event.name,
      year: args.event.year,
      city: args.event.city,
      stateProv: args.event.stateProv,
      country: args.event.country,
      startDate: args.event.startDate,
      endDate: args.event.endDate,
      isActive: true,
      importStatus: 'complete' as const,
      importSummary: `${args.teams.length} teams and ${args.matches.length} qualification matches imported from TBA.`,
      lastImportedAt: now,
      updatedAt: now,
    }
    const eventId = existingEvent
      ? existingEvent._id
      : await ctx.db.insert('events', { ...eventFields, createdAt: now })
    if (existingEvent) await ctx.db.patch(eventId, eventFields)

    const teamIdByKey = new Map<string, Id<'eventTeams'>>()
    for (const team of args.teams) {
      const existing = await ctx.db.query('eventTeams')
        .withIndex('by_event_id_and_tba_team_key', (q) => q.eq('eventId', eventId).eq('tbaTeamKey', team.key))
        .unique()
      const fields = {
        eventId,
        tbaTeamKey: team.key,
        teamNumber: team.teamNumber,
        nickname: team.nickname,
        city: team.city,
        stateProv: team.stateProv,
        country: team.country,
        updatedAt: now,
      }
      const teamId = existing
        ? existing._id
        : await ctx.db.insert('eventTeams', { ...fields, createdAt: now })
      if (existing) await ctx.db.patch(teamId, fields)
      teamIdByKey.set(team.key, teamId)
    }

    for (const match of args.matches) {
      const redTeams = match.redTeamKeys.map((key) => teamIdByKey.get(key))
      const blueTeams = match.blueTeamKeys.map((key) => teamIdByKey.get(key))
      if (redTeams.some((id) => id === undefined) || blueTeams.some((id) => id === undefined)) {
        throw new ConvexError(`Qualification match ${match.matchNumber} references a team missing from the TBA event team list.`)
      }
      const existing = await ctx.db.query('matches')
        .withIndex('by_event_id_and_tba_match_key', (q) => q.eq('eventId', eventId).eq('tbaMatchKey', match.key))
        .unique()
      const fields = {
        eventId,
        tbaMatchKey: match.key,
        matchNumber: match.matchNumber,
        scheduledTime: match.time,
        redTeams: redTeams as Id<'eventTeams'>[],
        blueTeams: blueTeams as Id<'eventTeams'>[],
        updatedAt: now,
      }
      const matchId = existing
        ? existing._id
        : await ctx.db.insert('matches', { ...fields, createdAt: now })
      if (existing) await ctx.db.patch(matchId, fields)
    }

    const summary = `${args.teams.length} teams and ${args.matches.length} qualification matches imported from TBA.`
    await ctx.db.insert('adminAuditLog', {
      actorId: admin._id,
      eventId,
      action: 'event_imported',
      targetType: 'event',
      targetId: args.event.key,
      details: summary,
      createdAt: now,
    })
    return { eventId, teamCount: args.teams.length, matchCount: args.matches.length, summary }
  },
})

export const persistFailure = internalMutation({
  args: { eventKey: v.string(), year: v.number(), summary: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const now = Date.now()
    const event = await ctx.db.query('events')
      .withIndex('by_tba_event_key', (q) => q.eq('tbaEventKey', args.eventKey))
      .unique()
    const fields = {
      importStatus: 'failed' as const,
      importSummary: args.summary.slice(0, 500),
      lastImportedAt: now,
      updatedAt: now,
    }
    const eventId = event
      ? event._id
      : await ctx.db.insert('events', {
        tbaEventKey: args.eventKey,
        name: args.eventKey,
        year: args.year,
        isActive: false,
        ...fields,
        createdAt: now,
      })
    if (event) await ctx.db.patch(eventId, fields)
    await ctx.db.insert('adminAuditLog', {
      actorId: admin._id,
      eventId,
      action: 'event_import_failed',
      targetType: 'event',
      targetId: args.eventKey,
      details: args.summary.slice(0, 500),
      createdAt: now,
    })
    return null
  },
})

export const importEvent = action({
  args: { eventKey: v.string() },
  returns: v.union(
    v.object({ status: v.literal('complete'), eventId: v.id('events'), teamCount: v.number(), matchCount: v.number(), summary: v.string() }),
    v.object({ status: v.literal('failed'), summary: v.string() }),
  ),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.events.requireAdminActor, {})
    const { key, year } = validateEventKey(args.eventKey)
    const apiKey = env.TBA_API_KEY?.trim()
    try {
      if (!apiKey) throw new Error('TBA API key is not configured in Convex environment variables.')
      const encodedKey = encodeURIComponent(key)
      const [rawEvent, rawTeams, rawMatches] = await Promise.all([
        fetchTbaJson(`event/${encodedKey}`, apiKey),
        fetchTbaJson(`event/${encodedKey}/teams/simple`, apiKey),
        fetchTbaJson(`event/${encodedKey}/matches/simple`, apiKey),
      ])
      const event = parseTbaEvent(rawEvent, key)
      const teams = parseTbaTeams(rawTeams)
      const matches = parseTbaQualificationMatches(rawMatches)
      if (teams.length === 0) throw new Error('TBA returned no participating teams for this event.')
      const teamKeys = new Set<string>()
      const teamNumbers = new Set<number>()
      for (const team of teams) {
        if (teamKeys.has(team.key) || teamNumbers.has(team.team_number)) {
          throw new Error('TBA returned duplicate participating team data.')
        }
        teamKeys.add(team.key)
        teamNumbers.add(team.team_number)
      }
      const matchKeys = new Set<string>()
      const matchNumbers = new Set<number>()
      for (const match of matches) {
        if (matchKeys.has(match.key) || matchNumbers.has(match.match_number)) {
          throw new Error('TBA returned duplicate qualification match data.')
        }
        matchKeys.add(match.key)
        matchNumbers.add(match.match_number)
        if ([...match.alliances.red.team_keys, ...match.alliances.blue.team_keys].some((teamKey) => !teamKeys.has(teamKey))) {
          throw new Error(`Qualification match ${match.match_number} references a team not listed for this event.`)
        }
      }
      const result: { eventId: Id<'events'>; teamCount: number; matchCount: number; summary: string } = await ctx.runMutation(
        internal.events.persistImport,
        {
          event: {
            key: event.key,
            name: event.name,
            year: event.year,
            city: event.city,
            stateProv: event.state_prov,
            country: event.country,
            startDate: event.start_date,
            endDate: event.end_date,
          },
          teams: teams.map((team) => ({
            key: team.key,
            teamNumber: team.team_number,
            nickname: team.nickname,
            city: team.city,
            stateProv: team.state_prov,
            country: team.country,
          })),
          matches: matches.map((match) => ({
            key: match.key,
            matchNumber: match.match_number,
            time: match.time,
            redTeamKeys: match.alliances.red.team_keys,
            blueTeamKeys: match.alliances.blue.team_keys,
          })),
        },
      )
      // The admin ID is deliberately not accepted by the persistence mutation; that
      // mutation derives and records the authenticated actor again on the server.
      return { status: 'complete' as const, ...result }
    } catch (error) {
      const summary = error instanceof Error ? error.message : 'The event import failed unexpectedly.'
      await ctx.runMutation(internal.events.persistFailure, { eventKey: key, year, summary })
      return { status: 'failed' as const, summary }
    }
  },
})
