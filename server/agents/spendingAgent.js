import { searchContracts, searchGrants } from '../services/usaSpending.js'

export async function runSpendingAgent({ keywords, entities, spendingTask }) {
  const keyword = keywords?.length ? null : entities?.[0] || ''
  const kwArray = keywords?.length ? keywords : undefined
  try {
    const [contracts, grants] = await Promise.all([
      searchContracts({ keyword, keywords: kwArray, limit: 8 }),
      searchGrants({ keyword, keywords: kwArray, limit: 5 }),
    ])
    return {
      contracts: contracts.map(c => ({
        recipient: c['Recipient Name'],
        amount: c['Award Amount'],
        agency: c['Awarding Agency'],
        date: c['Award Date'],
        description: c['Description']?.slice(0, 200),
      })),
      grants: grants.map(g => ({
        recipient: g['Recipient Name'],
        amount: g['Award Amount'],
        agency: g['Awarding Agency'],
        date: g['Award Date'],
      })),
    }
  } catch (e) {
    console.error('spendingAgent error:', e.message)
    return { contracts: [], grants: [] }
  }
}
