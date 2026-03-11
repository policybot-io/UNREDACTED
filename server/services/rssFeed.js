import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'UNREDACTED-Intelligence-Platform/1.0 (Government Accountability Research)',
  },
  customFields: {
    item: [['media:content', 'media'], ['dc:date', 'dcDate']],
  },
})

// ── RSS Source Definitions ──────────────────────────────────────────────────
const RSS_SOURCES = [
  {
    id: 'GAO',
    label: 'GAO',
    url: 'https://www.gao.gov/rss/reports-testimonies.xml',
    type: 'AUDIT',
  },
  {
    id: 'CBO',
    label: 'CBO',
    url: 'https://www.cbo.gov/publications/feed',
    type: 'BUDGET',
  },
  {
    id: 'FEDREG',
    label: 'FedReg',
    url: 'https://www.federalregister.gov/documents/search.atom?conditions%5Btopics%5D%5B%5D=government-procurement&per_page=20&order=newest',
    type: 'RULE',
  },
  {
    id: 'TREASURY',
    label: 'Treasury',
    url: 'https://home.treasury.gov/system/files/136/rss.xml',
    type: 'FINANCE',
  },
  {
    id: 'OMB',
    label: 'OMB',
    url: 'https://www.whitehouse.gov/omb/feed/',
    type: 'BUDGET',
  },
]

// ── Risk Keyword Scoring ────────────────────────────────────────────────────
const HIGH_RISK_KEYWORDS = [
  'sole-source', 'no-bid', 'fraud', 'waste', 'abuse', 'violation',
  'billion', 'misuse', 'improper payment', 'overbilling', 'kickback',
  'investigation', 'audit finding', 'debarment', 'suspension',
  'whistleblower', 'inspector general', 'ig report', 'overrun',
  'unauthorized', 'misappropriation',
]

const MED_RISK_KEYWORDS = [
  'contract award', 'procurement', 'appropriation', 'override',
  'amendment', 'modification', 'oversight', 'deficiency', 'concern',
  'review', 'corrective action', 'compliance', 'penalty', 'fine',
  'sanction', 'unsatisfactory', 'cost overrun', 'delay', 'million',
  'sole source',
]

function scoreRisk(text) {
  const lower = (text || '').toLowerCase()
  if (HIGH_RISK_KEYWORDS.some(kw => lower.includes(kw))) return 'HIGH'
  if (MED_RISK_KEYWORDS.some(kw => lower.includes(kw))) return 'MED'
  return 'LOW'
}

// ── Time Formatting ─────────────────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return 'recently'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'recently'
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Text Truncation ─────────────────────────────────────────────────────────
function truncate(str, maxLen = 100) {
  if (!str) return ''
  const clean = str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + '…' : clean
}

// ── In-Memory Cache ─────────────────────────────────────────────────────────
let _cache = null
let _cacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ── Fetch Single Source ─────────────────────────────────────────────────────
async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url)
    return (feed.items || []).slice(0, 8).map(item => {
      const title = truncate(item.title || item['content:encoded'] || '', 100)
      const summary = truncate(item.contentSnippet || item.summary || item.content || '', 160)
      const pubDate = item.pubDate || item.isoDate || item.dcDate || item.updated
      const combinedText = `${title} ${summary}`
      return {
        type: source.type,
        source: source.label,
        text: title,
        detail: summary || null,
        time: relativeTime(pubDate),
        pubDate: pubDate || null,
        risk: scoreRisk(combinedText),
        url: item.link || item.guid || null,
      }
    })
  } catch (err) {
    console.warn(`[rssFeed] Failed to fetch ${source.label}: ${err.message}`)
    return []
  }
}

// ── Main Export ─────────────────────────────────────────────────────────────
export async function getSpendingNews({ limit = 12 } = {}) {
  const now = Date.now()

  // Return cache if still fresh
  if (_cache && now - _cacheTime < CACHE_TTL_MS) {
    return { items: _cache.slice(0, limit), cached: true, fetchedAt: new Date(_cacheTime).toISOString() }
  }

  // Fetch all sources in parallel
  const results = await Promise.allSettled(RSS_SOURCES.map(fetchSource))
  const allItems = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Sort by pubDate descending (most recent first)
  allItems.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return db - da
  })

  // Prioritize HIGH risk items at top, then chronological
  const high = allItems.filter(i => i.risk === 'HIGH')
  const med = allItems.filter(i => i.risk === 'MED')
  const low = allItems.filter(i => i.risk === 'LOW')
  const sorted = [...high, ...med, ...low]

  // Update cache
  _cache = sorted
  _cacheTime = now

  return {
    items: sorted.slice(0, limit),
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    sources: RSS_SOURCES.map(s => s.label),
  }
}
