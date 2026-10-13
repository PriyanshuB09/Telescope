import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { requireAdmin, requireUser } from './lib/auth'
import { matchTags, pitTags, towerLevel } from './schema'

const capabilitiesValidator = v.object({
  collectsFloor: v.boolean(),
  collectsDepot: v.boolean(),
  receivesHumanPlayer: v.boolean(),
  scoresFuel: v.boolean(),
  stationaryScoring: v.boolean(),
  movingScoring: v.boolean(),
  multiDistanceScoring: v.boolean(),
  hasAutoRoutine: v.boolean(),
  autoScoresFuel: v.boolean(),
  autoCrossesCenter: v.boolean(),
  autoLevel1Attempt: v.boolean(),
  autoRepeatable: v.boolean(),
  teleopCollects: v.boolean(),
  teleopScores: v.boolean(),
  adaptsHubActivity: v.boolean(),
  playsDefense: v.boolean(),
  assistsPartners: v.boolean(),
  hasStrategicRole: v.boolean(),
  towerLevel1: v.boolean(),
  towerLevel2: v.boolean(),
  towerLevel3: v.boolean(),
})

const pitFieldsValidator = v.object({
  capabilities: capabilitiesValidator,
  drivetrain: v.union(v.literal('swerve'), v.literal('tank'), v.literal('other'), v.literal('unknown')),
  dimensions: v.optional(v.string()),
  intakeDesign: v.optional(v.string()),
  scoringMechanism: v.optional(v.string()),
  estimatedFuelCapacity: v.optional(v.string()),
  mobilityNotes: v.optional(v.string()),
  mechanicalFeatures: v.optional(v.string()),
  reliability: v.optional(v.number()),
  strengths: v.optional(v.string()),
  weaknesses: v.optional(v.string()),
  notes: v.optional(v.string()),
  tags: v.array(pitTags),
})

const reportFieldsValidator = v.object({
  autonomous: v.object({
    fuelScored: v.number(),
    level1Attempted: v.boolean(),
    level1Successful: v.boolean(),
    centerLineCrossed: v.boolean(),
    routineCompleted: v.boolean(),
    notes: v.optional(v.string()),
  }),
  teleop: v.object({
    fuelScored: v.number(),
    fuelScoredHubActive: v.optional(v.number()),
    fuelAttemptedUnscored: v.optional(v.number()),
    fuelConsistency: v.number(),
    collectionEffectiveness: v.number(),
    defensiveActivity: v.boolean(),
    notes: v.optional(v.string()),
  }),
  teleopTower: v.object({
    level1Attempted: v.boolean(),
    level1Successful: v.boolean(),
    level2Attempted: v.boolean(),
    level2Successful: v.boolean(),
    level3Attempted: v.boolean(),
    level3Successful: v.boolean(),
    finalObservedLevel: towerLevel,
    notes: v.optional(v.string()),
  }),
  driverRating: v.number(),
  defenseRating: v.number(),
  reliabilityRating: v.optional(v.number()),
  tags: v.array(matchTags),
})

const reportValidator = v.object({
  _id: v.id('matchScoutingReports'),
  _creationTime: v.number(),
  assignmentId: v.id('matchAssignments'),
  eventId: v.id('events'),
  matchId: v.id('matches'),
  teamId: v.id('eventTeams'),
  authorId: v.id('users'),
  ...reportFieldsValidator.fields,
  state: v.union(v.literal('draft'), v.literal('submitted')),
  submittedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const teamSummaryValidator = v.object({
  _id: v.id('eventTeams'),
  teamNumber: v.number(),
  tbaTeamKey: v.string(),
  nickname: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
  stateProv: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  pitScouted: v.boolean(),
  matchReportCount: v.number(),
})

const matchScheduleItemValidator = v.object({
  _id: v.id('matches'),
  matchNumber: v.number(),
  scheduledTime: v.union(v.number(), v.null()),
  redTeams: v.array(v.object({ team: teamSummaryValidator, assignmentState: v.union(v.literal('unclaimed'), v.literal('claimed'), v.literal('submitted')) })),
  blueTeams: v.array(v.object({ team: teamSummaryValidator, assignmentState: v.union(v.literal('unclaimed'), v.literal('claimed'), v.literal('submitted')) })),
})

function assertCount(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new ConvexError(`${label} must be a nonnegative whole-number count.`)
  }
}

function assertRating(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 10)) {
    throw new ConvexError(`${label} must be a whole number from 1 to 10.`)
  }
}

function validateReport(fields: {
  autonomous: { fuelScored: number; level1Attempted: boolean; level1Successful: boolean }
  teleop: { fuelScored: number; fuelScoredHubActive?: number; fuelAttemptedUnscored?: number; fuelConsistency: number; collectionEffectiveness: number }
  teleopTower: { level1Attempted: boolean; level1Successful: boolean; level2Attempted: boolean; level2Successful: boolean; level3Attempted: boolean; level3Successful: boolean }
  driverRating: number
  defenseRating: number
  reliabilityRating?: number
}) {
  assertCount(fields.autonomous.fuelScored, 'Autonomous Fuel')
  assertCount(fields.teleop.fuelScored, 'Teleop Fuel')
  assertCount(fields.teleop.fuelScoredHubActive, 'Hub-active Teleop Fuel')
  assertCount(fields.teleop.fuelAttemptedUnscored, 'Unscored attempted Fuel')
  if ((fields.teleop.fuelScoredHubActive ?? 0) > fields.teleop.fuelScored) {
    throw new ConvexError('Hub-active Fuel cannot exceed total observed Teleop Fuel scored.')
  }
  assertRating(fields.teleop.fuelConsistency, 'Fuel consistency')
  assertRating(fields.teleop.collectionEffectiveness, 'Collection effectiveness')
  assertRating(fields.driverRating, 'Driver rating')
  assertRating(fields.defenseRating, 'Defense rating')
  assertRating(fields.reliabilityRating, 'Reliability rating')
  if (fields.autonomous.level1Successful && !fields.autonomous.level1Attempted) {
    throw new ConvexError('An autonomous Level 1 success requires an attempt.')
  }
  for (const level of [1, 2, 3] as const) {
    const attempted = fields.teleopTower[`level${level}Attempted`]
    const successful = fields.teleopTower[`level${level}Successful`]
    if (successful && !attempted) throw new ConvexError(`A Teleop Level ${level} success requires an attempt.`)
  }
}

async function getTeamSummary(ctx: Parameters<typeof requireUser>[0], team: Doc<'eventTeams'>) {
  const [pit, reports] = await Promise.all([
    ctx.db.query('pitScoutingReports')
      .withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', team.eventId).eq('teamId', team._id))
      .unique(),
    ctx.db.query('matchScoutingReports')
      .withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', team.eventId).eq('teamId', team._id))
      .take(1001),
  ])
  return {
    _id: team._id,
    teamNumber: team.teamNumber,
    tbaTeamKey: team.tbaTeamKey,
    nickname: team.nickname ?? null,
    city: team.city ?? null,
    stateProv: team.stateProv ?? null,
    country: team.country ?? null,
    pitScouted: pit !== null,
    matchReportCount: Math.min(reports.length, 1000),
  }
}

export const listTeams = query({
  args: { eventId: v.id('events'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(teamSummaryValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    if (args.paginationOpts.numItems > 100) throw new ConvexError('Team pages are limited to 100 items.')
    const page = await ctx.db.query('eventTeams')
      .withIndex('by_event_id_and_team_number', (q) => q.eq('eventId', args.eventId))
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...page, page: await Promise.all(page.page.map((team) => getTeamSummary(ctx, team))) }
  },
})

export const dashboardSummary = query({
  args: { eventId: v.id('events') },
  returns: v.object({ teams: v.number(), pitReports: v.number(), matches: v.number(), submittedReports: v.number(), capped: v.boolean() }),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const [teams, pitReports, matches, reports] = await Promise.all([
      ctx.db.query('eventTeams').withIndex('by_event_id_and_team_number', (q) => q.eq('eventId', args.eventId)).take(501),
      ctx.db.query('pitScoutingReports').withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', args.eventId)).take(501),
      ctx.db.query('matches').withIndex('by_event_id_and_match_number', (q) => q.eq('eventId', args.eventId)).take(1001),
      ctx.db.query('matchScoutingReports').withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', args.eventId)).take(1001),
    ])
    return {
      teams: Math.min(teams.length, 500),
      pitReports: Math.min(pitReports.length, 500),
      matches: Math.min(matches.length, 1000),
      submittedReports: Math.min(reports.length, 1000),
      capped: teams.length > 500 || pitReports.length > 500 || matches.length > 1000 || reports.length > 1000,
    }
  },
})

export const getTeamDetail = query({
  args: { teamId: v.id('eventTeams') },
  returns: v.union(v.null(), v.object({
    team: v.object({ ...teamSummaryValidator.fields, eventId: v.id('events'), createdAt: v.number(), updatedAt: v.number() }),
    pitReport: v.union(v.null(), v.object({ ...pitFieldsValidator.fields, _id: v.id('pitScoutingReports'), authorId: v.id('users'), updatedAt: v.number() })),
    reports: v.array(v.object({ report: reportValidator, matchNumber: v.number(), scoutName: v.union(v.string(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const team = await ctx.db.get(args.teamId)
    if (!team) return null
    const [summary, pitReport, reports] = await Promise.all([
      getTeamSummary(ctx, team),
      ctx.db.query('pitScoutingReports')
        .withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', team.eventId).eq('teamId', team._id))
        .unique(),
      ctx.db.query('matchScoutingReports')
        .withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', team.eventId).eq('teamId', team._id))
        .order('desc')
        .take(50),
    ])
    const hydrated = await Promise.all(reports.map(async (report) => {
      const [match, scout] = await Promise.all([ctx.db.get(report.matchId), ctx.db.get(report.authorId)])
      return {
        report: { ...report, submittedAt: report.submittedAt ?? null },
        matchNumber: match?.matchNumber ?? 0,
        scoutName: scout?.name ?? null,
      }
    }))
    return {
      team: { ...summary, eventId: team.eventId, createdAt: team.createdAt, updatedAt: team.updatedAt },
      pitReport: pitReport ? {
        _id: pitReport._id,
        authorId: pitReport.authorId,
        capabilities: pitReport.capabilities,
        drivetrain: pitReport.drivetrain,
        dimensions: pitReport.dimensions,
        intakeDesign: pitReport.intakeDesign,
        scoringMechanism: pitReport.scoringMechanism,
        estimatedFuelCapacity: pitReport.estimatedFuelCapacity,
        mobilityNotes: pitReport.mobilityNotes,
        mechanicalFeatures: pitReport.mechanicalFeatures,
        reliability: pitReport.reliability,
        strengths: pitReport.strengths,
        weaknesses: pitReport.weaknesses,
        notes: pitReport.notes,
        tags: pitReport.tags,
        updatedAt: pitReport.updatedAt,
      } : null,
      reports: hydrated,
    }
  },
})

export const upsertPitReport = mutation({
  args: { eventId: v.id('events'), teamId: v.id('eventTeams'), fields: pitFieldsValidator },
  returns: v.object({ reportId: v.id('pitScoutingReports'), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const [event, team] = await Promise.all([ctx.db.get(args.eventId), ctx.db.get(args.teamId)])
    if (!event || !team || team.eventId !== event._id) throw new ConvexError('The selected team is not part of this event.')
    if (args.fields.reliability !== undefined && (args.fields.reliability < 1 || args.fields.reliability > 10)) {
      throw new ConvexError('Reliability must be from 1 to 10.')
    }
    const existing = await ctx.db.query('pitScoutingReports')
      .withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', event._id).eq('teamId', team._id))
      .unique()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { ...args.fields, authorId: user._id, updatedAt: now })
      return { reportId: existing._id, updatedAt: now }
    }
    const reportId = await ctx.db.insert('pitScoutingReports', {
      eventId: event._id,
      teamId: team._id,
      authorId: user._id,
      ...args.fields,
      createdAt: now,
      updatedAt: now,
    })
    return { reportId, updatedAt: now }
  },
})

export const getSchedule = query({
  args: { eventId: v.id('events'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(matchScheduleItemValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx)
    if (args.paginationOpts.numItems > 100) throw new ConvexError('Schedule pages are limited to 100 matches.')
    const page = await ctx.db.query('matches')
      .withIndex('by_event_id_and_match_number', (q) => q.eq('eventId', args.eventId))
      .order('asc')
      .paginate(args.paginationOpts)
    const schedule = await Promise.all(page.page.map(async (match) => {
      const assignments = await ctx.db.query('matchAssignments')
        .withIndex('by_event_match', (q) => q.eq('eventId', args.eventId).eq('matchId', match._id))
        .take(6)
      const assignmentByTeam = new Map(assignments.map((assignment) => [assignment.teamId, assignment.state]))
      const hydrateAlliance = async (teamIds: Doc<'matches'>['redTeams']) => Promise.all(teamIds.map(async (teamId) => {
        const team = await ctx.db.get(teamId)
        if (!team) throw new ConvexError('The schedule contains a missing team.')
        const state: 'unclaimed' | 'claimed' | 'submitted' = assignmentByTeam.get(teamId) ?? 'unclaimed'
        return { team: await getTeamSummary(ctx, team), assignmentState: state }
      }))
      return {
        _id: match._id,
        matchNumber: match.matchNumber,
        scheduledTime: match.scheduledTime ?? null,
        redTeams: await hydrateAlliance(match.redTeams),
        blueTeams: await hydrateAlliance(match.blueTeams),
      }
    }))
    return { ...page, page: schedule }
  },
})

export const claimAssignment = mutation({
  args: { eventId: v.id('events'), matchId: v.id('matches'), teamId: v.id('eventTeams') },
  returns: v.object({ assignmentId: v.id('matchAssignments'), state: v.union(v.literal('claimed'), v.literal('submitted')), alreadyClaimed: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const [match, team] = await Promise.all([ctx.db.get(args.matchId), ctx.db.get(args.teamId)])
    if (!match || !team || match.eventId !== args.eventId || team.eventId !== args.eventId) {
      throw new ConvexError('The selected match and team must belong to the selected event.')
    }
    if (!match.redTeams.includes(team._id) && !match.blueTeams.includes(team._id)) {
      throw new ConvexError('The selected team is not scheduled for this match.')
    }
    const existing = await ctx.db.query('matchAssignments')
      .withIndex('by_event_match_team', (q) => q.eq('eventId', args.eventId).eq('matchId', match._id).eq('teamId', team._id))
      .unique()
    if (existing) {
      if (existing.scoutId !== user._id) throw new ConvexError('This robot already has a scout assigned for this match.')
      return { assignmentId: existing._id, state: existing.state, alreadyClaimed: true }
    }
    const now = Date.now()
    const assignmentId = await ctx.db.insert('matchAssignments', {
      eventId: args.eventId,
      matchId: match._id,
      teamId: team._id,
      scoutId: user._id,
      state: 'claimed',
      claimedAt: now,
      updatedAt: now,
    })
    return { assignmentId, state: 'claimed' as const, alreadyClaimed: false }
  },
})

export const submitMatchReport = mutation({
  args: { assignmentId: v.id('matchAssignments'), fields: reportFieldsValidator },
  returns: v.object({ reportId: v.id('matchScoutingReports'), submittedAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    validateReport(args.fields)
    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) throw new ConvexError('The match assignment was not found.')
    if (assignment.scoutId !== user._id) throw new ConvexError('Only the assigned scout can submit this report.')
    const [existingForAssignment, existingForTeamMatch] = await Promise.all([
      ctx.db.query('matchScoutingReports')
        .withIndex('by_assignment_id', (q) => q.eq('assignmentId', assignment._id))
        .unique(),
      ctx.db.query('matchAssignments')
        .withIndex('by_event_match_team', (q) => q.eq('eventId', assignment.eventId).eq('matchId', assignment.matchId).eq('teamId', assignment.teamId))
        .unique(),
    ])
    if (existingForAssignment) throw new ConvexError('A report has already been submitted for this assignment.')
    if (!existingForTeamMatch || existingForTeamMatch._id !== assignment._id) throw new ConvexError('The team and match already have another assignment.')
    const now = Date.now()
    const reportId = await ctx.db.insert('matchScoutingReports', {
      assignmentId: assignment._id,
      eventId: assignment.eventId,
      matchId: assignment.matchId,
      teamId: assignment.teamId,
      authorId: user._id,
      ...args.fields,
      state: 'submitted',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(assignment._id, { state: 'submitted', updatedAt: now })
    return { reportId, submittedAt: now }
  },
})

export const listMatchReportsForAdmin = query({
  args: { eventId: v.id('events'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(reportValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    if (args.paginationOpts.numItems > 100) throw new ConvexError('Report pages are limited to 100 items.')
    const page = await ctx.db.query('matchScoutingReports')
      .withIndex('by_event_id_and_team_id', (q) => q.eq('eventId', args.eventId))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map((report) => ({ ...report, submittedAt: report.submittedAt ?? null })),
    }
  },
})

export const correctMatchReport = mutation({
  args: { reportId: v.id('matchScoutingReports'), fields: reportFieldsValidator, details: v.string() },
  returns: v.object({ reportId: v.id('matchScoutingReports'), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    validateReport(args.fields)
    const report = await ctx.db.get(args.reportId)
    if (!report || report.state !== 'submitted') throw new ConvexError('The submitted report was not found.')
    const now = Date.now()
    await ctx.db.patch(report._id, { ...args.fields, updatedAt: now })
    await ctx.db.insert('adminAuditLog', {
      actorId: admin._id,
      eventId: report.eventId,
      action: 'correct_match_scouting_report',
      targetType: 'matchScoutingReports',
      targetId: report._id,
      details: args.details,
      createdAt: now,
    })
    return { reportId: report._id, updatedAt: now }
  },
})
