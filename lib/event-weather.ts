export const EVENT_START = Date.parse('2026-12-19T19:00:00-03:00')
export const WEATHER_CHECK_START = EVENT_START - 60 * 60 * 1000
export const WEATHER_CHECK_END = Date.parse('2026-12-20T00:00:00-03:00')
export const WEATHER_REFRESH_MS = 5 * 60 * 1000
const INTERVAL_MS = 15 * 60 * 1000

export const VENUES = {
  outdoor: {
    id: 'outdoor', name: 'Anfiteatro de la Juventud',
    address: 'Av. Napoleón Uriburu y Av. 9 de Julio, Formosa.',
    destination: '-26.1936919,-58.1701572',
  },
  indoor: {
    id: 'indoor', name: 'Parroquia María Auxiliadora',
    address: 'Av. 9 de Julio 1015, Formosa.',
    destination: 'Parroquia María Auxiliadora, Av. 9 de Julio 1015, Formosa, Argentina',
  },
} as const

export function weatherApiUrl() {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: '-26.1936919', longitude: '-58.1701572',
    minutely_15: 'precipitation', timeformat: 'unixtime',
    timezone: 'America/Argentina/Buenos_Aires',
    start_date: '2026-12-19', end_date: '2026-12-19',
  }).toString()
  return url.toString()
}

// Evaluate only elapsed intervals, never a future forecast or today's weather
// before the event. Past wet intervals keep the indoor venue selected even
// when the rain stops later that evening.
export function hasRainSinceCheck(data: unknown, now: number) {
  const weather = data as { minutely_15_units?: { precipitation?: unknown }; minutely_15?: { time?: unknown; precipitation?: unknown } }
  const times = weather?.minutely_15?.time
  const values = weather?.minutely_15?.precipitation
  if (weather?.minutely_15_units?.precipitation !== 'mm' || !Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
    throw new Error('Incomplete weather response')
  }
  const last = Math.floor(Math.min(now, WEATHER_CHECK_END - 1) / INTERVAL_MS) * INTERVAL_MS
  const samples = new Map<number, number>()
  times.forEach((time, index) => {
    if (typeof time !== 'number' || !Number.isFinite(time)) return
    const stamp = time * 1000
    if (stamp < WEATHER_CHECK_START || stamp > last) return
    const value = values[index]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || samples.has(stamp)) throw new Error('Invalid weather sample')
    samples.set(stamp, value)
  })
  for (let time = WEATHER_CHECK_START; time <= last; time += INTERVAL_MS) {
    if (!samples.has(time)) throw new Error('Weather sample unavailable')
  }
  return [...samples.values()].some(value => value > 0)
}

export function createEventVenueService(loadWeather: () => Promise<unknown>, clock: () => number = Date.now) {
  let lastCheck = 0
  let checkedAt: string | null = null
  let indoor = false
  let available = false
  let inFlight: Promise<void> | null = null

  return async function getEventVenue(override?: string) {
    const now = clock()
    const manual = override === 'indoor' || override === 'outdoor' ? override : null
    const active = now >= WEATHER_CHECK_START && now < WEATHER_CHECK_END
    if (active && !manual && (!lastCheck || now - lastCheck >= WEATHER_REFRESH_MS)) {
      if (!inFlight) {
        inFlight = (async () => {
          try {
            const rain = hasRainSinceCheck(await loadWeather(), now)
            indoor ||= rain
            checkedAt = new Date(now).toISOString()
            available = true
          } catch {
            // An outage is unknown weather, never evidence of a dry evening.
            available = false
          } finally {
            lastCheck = now
            inFlight = null
          }
        })()
      }
      await inFlight
    }
    const status = manual ? 'manual' : now < WEATHER_CHECK_START ? 'scheduled' : now >= WEATHER_CHECK_END ? 'ended' : !available ? 'unavailable' : indoor ? 'rain' : 'dry'
    return {
      status,
      venue: VENUES[manual || (indoor ? 'indoor' : 'outdoor')],
      checkedAt, serverTime: new Date(now).toISOString(),
      checkStartsAt: new Date(WEATHER_CHECK_START).toISOString(),
      refreshAfterMs: now >= WEATHER_CHECK_END ? 0 : now < WEATHER_CHECK_START ? Math.min(60 * 60 * 1000, WEATHER_CHECK_START - now) : WEATHER_REFRESH_MS,
    }
  }
}
