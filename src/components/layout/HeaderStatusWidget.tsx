import { useState, useEffect, useRef } from 'react'
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, Thermometer } from 'lucide-react'

// ── WMO Weather Code → { label, Icon } ───────────────────────────────────────
function weatherFromCode(code: number): { label: string; Icon: React.ElementType } {
  if (code === 0) return { label: 'Clear', Icon: Sun }
  if (code <= 2) return { label: 'Partly Cloudy', Icon: CloudSun }
  if (code === 3) return { label: 'Overcast', Icon: Cloud }
  if (code <= 67) return { label: 'Rain', Icon: CloudRain }
  if (code <= 77) return { label: 'Snow', Icon: CloudSnow }
  if (code <= 82) return { label: 'Rain', Icon: CloudRain }
  if (code <= 99) return { label: 'Thunderstorm', Icon: CloudLightning }
  return { label: 'Cloudy', Icon: Cloud }
}

// ── Supported Timezone Options ────────────────────────────────────────────────
export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (AZ)' },
  { value: 'UTC', label: 'UTC' },
]

// ── Weather Location ──────────────────────────────────────────────────────────
const WEATHER_LOCATION = { lat: 40.7128, lon: -74.006, name: 'New York, NY' }

// ── Load/save prefs from localStorage ────────────────────────────────────────
function loadPrefs() {
  try {
    const raw = localStorage.getItem('header_status_prefs')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { enabled: true, timezone: 'America/New_York', unit: 'F' }
}

export function saveHeaderPrefs(prefs: { enabled: boolean; timezone: string; unit: 'F' | 'C' }) {
  try { localStorage.setItem('header_status_prefs', JSON.stringify(prefs)) } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HeaderStatusWidget() {
  const prefs = loadPrefs()

  const [now, setNow] = useState(new Date())
  const [temp, setTemp] = useState<number | null>(null)
  const [weatherCode, setWeatherCode] = useState<number | null>(null)
  const fetchedRef = useRef(false)

  // Tick every second for zero clock drift
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  // Fetch weather on mount + every 30 minutes
  useEffect(() => {
    if (!prefs.enabled) return
    const fetchWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LOCATION.lat}&longitude=${WEATHER_LOCATION.lon}&current_weather=true`
        const res = await fetch(url)
        const json = await res.json()
        if (json?.current_weather) {
          setTemp(Math.round(json.current_weather.temperature))
          setWeatherCode(json.current_weather.weathercode)
        }
      } catch { /* silently fail, weather is optional */ }
    }
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchWeather()
    }
    const id = setInterval(fetchWeather, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [prefs.enabled])

  if (!prefs.enabled) return null

  const tz = prefs.timezone || 'America/New_York'
  const unit: 'F' | 'C' = prefs.unit || 'F'

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now)

  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now)

  const tzAbbr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || ''

  // Convert Celsius → Fahrenheit if needed (Open-Meteo returns Celsius)
  const displayTemp = temp !== null
    ? unit === 'F' ? Math.round((temp * 9) / 5 + 32) : temp
    : null

  const { Icon: WeatherIcon } = weatherCode !== null ? weatherFromCode(weatherCode) : { Icon: Thermometer }

  return (
    <div
      id="header-status-widget"
      className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-700 select-none shrink-0"
      title={`${WEATHER_LOCATION.name} — ${tz}`}
    >
      {displayTemp !== null && (
        <>
          <WeatherIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="font-semibold text-gray-800">
            {displayTemp}&deg;{unit}
          </span>
          <span className="text-gray-300 mx-0.5">·</span>
        </>
      )}
      <span className="text-gray-500">{dateStr}</span>
      <span className="text-gray-300 mx-0.5">·</span>
      <span className="font-semibold text-gray-800">{timeStr}</span>
      {tzAbbr && (
        <span className="text-gray-400 text-[10px] font-semibold ml-0.5">{tzAbbr}</span>
      )}
    </div>
  )
}
