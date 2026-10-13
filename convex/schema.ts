import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userRole = v.union(v.literal('admin'), v.literal('scout'))
export const pitTags = v.union(
  v.literal('fuel-capable'),
  v.literal('strong-auto'),
  v.literal('reliable-climber'),
  v.literal('defensive-specialist'),
  v.literal('needs-follow-up'),
)
export const matchTags = v.union(
  v.literal('fast'),
  v.literal('accurate'),
  v.literal('good-driver'),
  v.literal('plays-defense'),
  v.literal('effective-collection'),
  v.literal('consistent-scorer'),
  v.literal('strong-auto'),
  v.literal('reliable-climber'),
  v.literal('failed-climb'),
  v.literal('inconsistent'),
  v.literal('broke-down'),
  v.literal('defensive-specialist'),
  v.literal('poor-mobility'),
  v.literal('needs-further-scouting'),
)
export const pickTier = v.union(
  v.literal('tier1'),
  v.literal('tier2'),
  v.literal('tier3'),
  v.literal('doNotPick'),
  v.literal('uncategorized'),
)
export const towerLevel = v.union(v.literal('none'), v.literal('level1'), v.literal('level2'), v.literal('level3'))

const userFields = {
  username: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  role: v.optional(userRole),
}

const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
}

export default defineSchema({
  ...authTables,
  users: defineTable(userFields)
    .index('by_username', ['username'])
    .index('email', ['email'])
    .index('phone', ['phone'])
    .index('by_role', ['role']),
  events: defineTable({
    tbaEventKey: v.string(),
    name: v.string(),
    year: v.number(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    isActive: v.boolean(),
    importStatus: v.union(v.literal('complete'), v.literal('failed')),
    importSummary: v.optional(v.string()),
    lastImportedAt: v.number(),
    ...timestamps,
  })
    .index('by_tba_event_key', ['tbaEventKey'])
    .index('by_active', ['isActive']),
  eventTeams: defineTable({
    eventId: v.id('events'),
    tbaTeamKey: v.string(),
    teamNumber: v.number(),
    nickname: v.optional(v.string()),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
    ...timestamps,
  })
    .index('by_event_id_and_team_number', ['eventId', 'teamNumber'])
    .index('by_event_id_and_tba_team_key', ['eventId', 'tbaTeamKey']),
  matches: defineTable({
    eventId: v.id('events'),
    tbaMatchKey: v.string(),
    matchNumber: v.number(),
    scheduledTime: v.optional(v.number()),
    redTeams: v.array(v.id('eventTeams')),
    blueTeams: v.array(v.id('eventTeams')),
    ...timestamps,
  })
    .index('by_event_id_and_tba_match_key', ['eventId', 'tbaMatchKey'])
    .index('by_event_id_and_match_number', ['eventId', 'matchNumber']),
  pitScoutingReports: defineTable({
    eventId: v.id('events'),
    teamId: v.id('eventTeams'),
    authorId: v.id('users'),
    capabilities: v.object({
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
    }),
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
    ...timestamps,
  })
    .index('by_event_id_and_team_id', ['eventId', 'teamId'])
    .index('by_event_id_and_author_id', ['eventId', 'authorId']),
  matchAssignments: defineTable({
    eventId: v.id('events'),
    matchId: v.id('matches'),
    teamId: v.id('eventTeams'),
    scoutId: v.id('users'),
    state: v.union(v.literal('claimed'), v.literal('submitted')),
    claimedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event_match_team', ['eventId', 'matchId', 'teamId'])
    .index('by_event_match', ['eventId', 'matchId'])
    .index('by_scout_event_match', ['scoutId', 'eventId', 'matchId']),
  matchScoutingReports: defineTable({
    assignmentId: v.id('matchAssignments'),
    eventId: v.id('events'),
    matchId: v.id('matches'),
    teamId: v.id('eventTeams'),
    authorId: v.id('users'),
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
    state: v.union(v.literal('draft'), v.literal('submitted')),
    submittedAt: v.optional(v.number()),
    ...timestamps,
  })
    .index('by_assignment_id', ['assignmentId'])
    .index('by_event_id_and_team_id', ['eventId', 'teamId'])
    .index('by_event_id_and_match_id', ['eventId', 'matchId']),
  personalPickLists: defineTable({
    eventId: v.id('events'),
    ownerId: v.id('users'),
    name: v.string(),
    ...timestamps,
  })
    .index('by_owner_event', ['ownerId', 'eventId'])
    .index('by_event', ['eventId']),
  personalPickListEntries: defineTable({
    listId: v.id('personalPickLists'),
    eventTeamId: v.id('eventTeams'),
    tier: pickTier,
    position: v.number(),
    updatedAt: v.number(),
  })
    .index('by_list_position', ['listId', 'tier', 'position'])
    .index('by_list_team', ['listId', 'eventTeamId']),
  primaryPickLists: defineTable({
    eventId: v.id('events'),
    createdBy: v.id('users'),
    name: v.string(),
    hasManualChanges: v.boolean(),
    ...timestamps,
  }).index('by_event', ['eventId']),
  primaryPickListEntries: defineTable({
    listId: v.id('primaryPickLists'),
    eventTeamId: v.id('eventTeams'),
    tier: pickTier,
    position: v.number(),
    updatedAt: v.number(),
  })
    .index('by_list_position', ['listId', 'tier', 'position'])
    .index('by_list_team', ['listId', 'eventTeamId']),
  pickListMerges: defineTable({
    eventId: v.id('events'),
    primaryListId: v.id('primaryPickLists'),
    appliedBy: v.id('users'),
    appliedAt: v.number(),
    sourceCount: v.number(),
    scoringConfig: v.object({ tier1Weight: v.number(), tier2Weight: v.number(), tier3Weight: v.number(), doNotPickWeight: v.number() }),
    summary: v.string(),
    ...timestamps,
  }).index('by_event_and_applied_at', ['eventId', 'appliedAt']),
  pickListMergeSources: defineTable({
    mergeId: v.id('pickListMerges'),
    scoutId: v.id('users'),
    personalListId: v.id('personalPickLists'),
    sourceName: v.string(),
  }).index('by_merge_and_scout', ['mergeId', 'scoutId']),
  pickListMergeSourceEntries: defineTable({
    mergeId: v.id('pickListMerges'),
    scoutId: v.id('users'),
    eventTeamId: v.id('eventTeams'),
    tier: pickTier,
    position: v.number(),
  })
    .index('by_merge_scout_team', ['mergeId', 'scoutId', 'eventTeamId'])
    .index('by_merge_scout_position', ['mergeId', 'scoutId', 'tier', 'position']),
  pickListMergeScores: defineTable({
    mergeId: v.id('pickListMerges'),
    eventTeamId: v.id('eventTeams'),
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
  }).index('by_merge_and_position', ['mergeId', 'position']),
  adminAuditLog: defineTable({
    actorId: v.id('users'),
    eventId: v.optional(v.id('events')),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_actor_and_created_at', ['actorId', 'createdAt'])
    .index('by_event_and_created_at', ['eventId', 'createdAt']),
})
