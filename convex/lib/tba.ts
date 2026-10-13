export interface TbaEvent {
  key: string
  name: string
  year: number
  city?: string
  state_prov?: string
  country?: string
  start_date?: string
  end_date?: string
}

export interface TbaTeam {
  key: string
  team_number: number
  nickname?: string
  city?: string
  state_prov?: string
  country?: string
}

export interface TbaQualificationMatch {
  key: string
  match_number: number
  time?: number
  alliances: {
    red: { team_keys: string[] }
    blue: { team_keys: string[] }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`TBA returned an invalid ${field}.`)
  return value
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`TBA returned an invalid ${field}.`)
  }
  return value
}

export function parseTbaEvent(value: unknown, expectedKey: string): TbaEvent {
  if (!isRecord(value)) throw new Error('TBA returned an invalid event response.')
  const key = requiredString(value.key, 'event key')
  const year = value.year
  if (key !== expectedKey || typeof year !== 'number' || !Number.isInteger(year)) {
    throw new Error('TBA returned incomplete or mismatched event data.')
  }
  return {
    key,
    name: requiredString(value.name, 'event name'),
    year,
    city: optionalString(value.city, 'event city'),
    state_prov: optionalString(value.state_prov, 'event state or province'),
    country: optionalString(value.country, 'event country'),
    start_date: optionalString(value.start_date, 'event start date'),
    end_date: optionalString(value.end_date, 'event end date'),
  }
}

export function parseTbaTeams(value: unknown): TbaTeam[] {
  if (!Array.isArray(value)) throw new Error('TBA returned an invalid event teams response.')
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`TBA returned invalid data for team ${index + 1}.`)
    const key = requiredString(item.key, `team ${index + 1} key`)
    const teamNumber = item.team_number
    if (!/^frc\d+$/.test(key) || typeof teamNumber !== 'number' || !Number.isInteger(teamNumber) || teamNumber <= 0) {
      throw new Error(`TBA returned incomplete data for team ${index + 1}.`)
    }
    return {
      key,
      team_number: teamNumber,
      nickname: optionalString(item.nickname, 'team nickname'),
      city: optionalString(item.city, 'team city'),
      state_prov: optionalString(item.state_prov, 'team state or province'),
      country: optionalString(item.country, 'team country'),
    }
  })
}

export function parseTbaQualificationMatches(value: unknown): TbaQualificationMatch[] {
  if (!Array.isArray(value)) throw new Error('TBA returned an invalid event matches response.')
  const matches: TbaQualificationMatch[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) throw new Error(`TBA returned invalid data for match ${index + 1}.`)
    if (item.comp_level !== 'qm') continue
    const alliances = item.alliances
    if (!isRecord(alliances) || !isRecord(alliances.red) || !isRecord(alliances.blue)) {
      throw new Error(`TBA returned incomplete alliance data for qualification match ${index + 1}.`)
    }
    const readTeams = (alliance: Record<string, unknown>, color: string): string[] => {
      const teamKeys = alliance.team_keys
      if (!Array.isArray(teamKeys) || teamKeys.length !== 3 || teamKeys.some((key) => typeof key !== 'string' || !/^frc\d+$/.test(key))) {
        throw new Error(`TBA returned incomplete ${color} alliance data for qualification match ${index + 1}.`)
      }
      return teamKeys as string[]
    }
    const key = requiredString(item.key, `qualification match ${index + 1} key`)
    const matchNumber = item.match_number
    const time = item.time
    if (!Number.isInteger(matchNumber) || (time !== null && time !== undefined && (typeof time !== 'number' || !Number.isFinite(time)))) {
      throw new Error(`TBA returned incomplete data for qualification match ${index + 1}.`)
    }
    matches.push({
      key,
      match_number: matchNumber as number,
      time: typeof time === 'number' ? time : undefined,
      alliances: {
        red: { team_keys: readTeams(alliances.red, 'red') },
        blue: { team_keys: readTeams(alliances.blue, 'blue') },
      },
    })
  }
  return matches
}

export async function fetchTbaJson(path: string, apiKey: string): Promise<unknown> {
  const url = `https://www.thebluealliance.com/api/v3/${path}`
  let lastError = 'TBA request failed.'
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'X-TBA-Auth-Key': apiKey, 'User-Agent': 'Telescope-Scouting-App' },
      })
      if (response.ok) {
        try {
          return await response.json()
        } catch {
          throw new Error('TBA returned a response that was not valid JSON.')
        }
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = response.status === 429 ? 'TBA is rate limiting requests.' : 'TBA is temporarily unavailable.'
        if (attempt < 2) {
          const retryAfter = Number(response.headers.get('Retry-After'))
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 5000)
            : 250 * 2 ** attempt
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          continue
        }
      } else if (response.status === 404) {
        throw new Error('TBA could not find that event. Check the event key and try again.')
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('TBA rejected the configured API key. Check the Convex TBA_API_KEY setting.')
      } else {
        throw new Error(`TBA rejected the request (HTTP ${response.status}).`)
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('fetch failed')) throw error
      lastError = 'Could not connect to TBA.'
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
    }
  }
  throw new Error(lastError)
}
