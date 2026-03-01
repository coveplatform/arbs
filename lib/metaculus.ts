import { Market } from './types'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
}

interface MetaculusQuestion {
  id: number
  title: string
  page_url: string
  community_prediction: { full?: { q2?: number } } | null
  number_of_forecasters: number
  close_time: string | null
  possibilities: { type: string }
}

interface MetaculusResponse {
  results: MetaculusQuestion[]
}

// Try the original API endpoint — returns 403 from some IPs.
// If token is set in env, pass it as auth.
export async function fetchMetaculusMarkets(limit = 100): Promise<Market[]> {
  try {
    const headers: Record<string, string> = { ...HEADERS }
    if (process.env.METACULUS_TOKEN) {
      headers['Authorization'] = `Token ${process.env.METACULUS_TOKEN}`
    }

    const res = await fetch(
      `https://www.metaculus.com/api2/questions/?format=json&limit=${limit}&order_by=-number_of_forecasters&status=open&type=forecast`,
      { cache: 'no-store', headers, signal: AbortSignal.timeout(10000) }
    )

    if (!res.ok) {
      console.warn('Metaculus HTTP', res.status)
      return []
    }

    const data: MetaculusResponse = await res.json()

    return (data.results || [])
      .filter(q =>
        q.possibilities?.type === 'binary' &&
        q.community_prediction?.full?.q2 !== undefined &&
        q.community_prediction.full.q2 > 0
      )
      .map(q => {
        const prob = q.community_prediction!.full!.q2!
        return {
          id:       `metaculus-${q.id}`,
          platform: 'metaculus' as const,
          question: q.title,
          yesPrice: prob,
          noPrice:  1 - prob,
          volume:   q.number_of_forecasters || 0,
          url:      `https://metaculus.com${q.page_url}`,
          endDate:  q.close_time ?? undefined,
        }
      })
      .filter(m => m.yesPrice > 0.01 && m.yesPrice < 0.99)
  } catch (err) {
    console.error('Metaculus fetch error:', String(err).slice(0, 100))
    return []
  }
}
