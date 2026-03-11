import { searchRules } from '../services/federalRegister.js'

export async function runPolicyAgent({ keywords, entities, policyTask }) {
  const keyword = (keywords?.length ? keywords.join(' ') : null) || entities?.[0] || ''
  try {
    const rules = await searchRules({ keyword, limit: 8 })
    return rules.map(r => ({
      title: r.title,
      agency: r.agency_names?.join(', '),
      date: r.publication_date,
      type: r.type,
      abstract: r.abstract?.slice(0, 300),
      url: r.html_url,
      significant: r.significant,
    }))
  } catch (e) {
    console.error('policyAgent error:', e.message)
    return []
  }
}
