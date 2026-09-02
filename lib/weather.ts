export type DailyWeather = { date: string; tempC: number; precipChance: number; summary: string };

const WEATHER_CODE_SUMMARY: Record<number, string> = {
  0: "晴朗",
  1: "晴時多雲",
  2: "多雲",
  3: "陰天",
  45: "有霧",
  48: "有霧",
  51: "毛毛雨",
  53: "毛毛雨",
  55: "毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "陣雨",
  81: "陣雨",
  82: "強陣雨",
  95: "雷雨",
};

// In-memory cache so navigating away and back (e.g. switching pages) within
// the same session doesn't re-fetch and briefly blank out the weather widget
// while the network round-trip is in flight.
const cache = new Map<string, DailyWeather[]>();

// Free, no-API-key geocoding + forecast via Open-Meteo.
export async function fetchWeatherForDestination(
  destination: string,
  dates: string[]
): Promise<DailyWeather[]> {
  const cacheKey = `${destination}|${dates[0]}|${dates[dates.length - 1]}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        destination
      )}&count=1&language=zh`
    );
    const geo = await geoRes.json();
    const loc = geo?.results?.[0];
    if (!loc) return [];

    const start = dates[0];
    const end = dates[dates.length - 1];
    const forecastRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&daily=temperature_2m_max,precipitation_probability_max,weather_code` +
        `&timezone=auto&start_date=${start}&end_date=${end}`
    );
    const forecast = await forecastRes.json();
    const daily = forecast?.daily;
    if (!daily?.time) return [];

    const result = daily.time.map((date: string, i: number) => ({
      date,
      tempC: Math.round(daily.temperature_2m_max[i]),
      precipChance: daily.precipitation_probability_max[i] ?? 0,
      summary: WEATHER_CODE_SUMMARY[daily.weather_code[i]] ?? "天氣多變",
    }));
    cache.set(cacheKey, result);
    return result;
  } catch {
    return [];
  }
}
