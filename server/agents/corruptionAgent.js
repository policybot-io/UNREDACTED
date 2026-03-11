import { createChatCompletion, safeJsonParse } from '../services/aiService.js'

export async function runCorruptionAgent({ plan, policyResults, spendingResults, donorResults, originalQuery }) {
  // Build context from all three data sources, budget chars across them
  const policyCtx = JSON.stringify(policyResults || [], null, 2).slice(0, 1500)
  const spendingCtx = JSON.stringify(spendingResults || {}, null, 2).slice(0, 2000)
  const donorCtx = JSON.stringify(donorResults || {}, null, 2).slice(0, 2000)

  const context = `POLICY DATA (Federal Register):\n${policyCtx}\n\nSPENDING DATA (USASpending.gov):\n${spendingCtx}\n\nCAMPAIGN FINANCE DATA (FEC):\n${donorCtx}`

  const response = await createChatCompletion({
    model: process.env.AI_PROVIDER === 'groq' ? 'llama-3.3-70b-versatile' : 'deepseek-chat',
    response_format: { type: 'json_object' },
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: `You are the Corruption Analysis Agent for UNREDACTED.
You have access to three data sources: federal policy rules, government spending/contracts, and FEC campaign finance.
Analyze ALL provided data for corruption patterns.

Key patterns to detect:
- QUID PRO QUO: PAC/committee donates to politician → politician oversees agency → agency awards contract to same donor
- REGULATORY CAPTURE: Company comments on rule → rule changes in company's favor → company donated to committee chair
- SPENDING CONCENTRATION: Sole-source awards to top PAC donors
- REVOLVING DOOR: Officials moving between regulated industry and government
- TIMING: Contract awards or rule changes shortly after large donations

Respond ONLY with valid JSON:
{
  "summary": "1-2 sentence summary of what was found across all data sources",
  "findings": [
    {
      "company": "entity name",
      "pattern": "specific corruption pattern detected",
      "policyLink": "related Federal Register rule title if any",
      "spendingAmount": "dollar amount from USASpending if applicable",
      "donorLink": "FEC committee or donation connection if any",
      "riskScore": 0-100,
      "confidence": "LOW|MED|HIGH"
    }
  ],
  "inference": "key cross-source pattern or anomaly detected",
  "riskLevel": "LOW|MED|HIGH",
  "sources": ["list of data sources that had relevant hits"],
  "flags": ["specific red flags as short bullet points"]
}`,
      },
      {
        role: 'user',
        content: `Query: ${originalQuery}\n\nData:\n${context}`,
      },
    ],
  })

  return safeJsonParse(response.choices[0].message.content) || {
    summary: 'Analysis failed',
    findings: [],
    inference: 'Error parsing AI response',
    riskLevel: 'LOW',
    sources: [],
    flags: ['Error processing response'],
  }
}
