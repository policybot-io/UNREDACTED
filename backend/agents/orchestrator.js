import { createChatCompletion, safeJsonParse } from '../services/aiService.js'
import { runPolicyAgent } from './policyAgent.js'
import { runSpendingAgent } from './spendingAgent.js'
import { runCorruptionAgent } from './corruptionAgent.js'
import { runDonorAgent } from './donorAgent.js'

export async function orchestrate(userQuery) {
  // Step 1: Decompose the query using the active AI provider
  const decomposition = await createChatCompletion({
    response_format: { type: 'json_object' },
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are the orchestrator for UNREDACTED, a corruption intelligence platform.
Given a user query, decompose it into tasks for sub-agents.
Respond ONLY with valid JSON:
{
  "intent": "brief description of what user wants",
  "policyTask": "what to fetch from Federal Register/GovInfo (or null)",
  "spendingTask": "what to fetch from USASpending (or null)",
  "donorTask": "what campaign finance / PAC data to look up (or null)",
  "corruptionFocus": "what pattern/anomaly to look for (or null)",
  "entities": ["list", "of", "key", "entities", "mentioned"],
  "keywords": ["search", "terms"]
}`,
      },
      { role: 'user', content: userQuery },
    ],
  })

  const plan = safeJsonParse(decomposition.choices[0].message.content) || {
    intent: 'Unknown query',
    policyTask: null,
    spendingTask: null,
    donorTask: null,
    corruptionFocus: null,
    entities: [],
    keywords: [],
  }

  // Step 2: Run all sub-agents in parallel
  const [policyResults, spendingResults, donorResults] = await Promise.all([
    plan.policyTask ? runPolicyAgent(plan) : Promise.resolve([]),
    plan.spendingTask ? runSpendingAgent(plan) : Promise.resolve({ contracts: [], grants: [] }),
    plan.donorTask ? runDonorAgent(plan) : Promise.resolve({ committees: [], candidates: [] }),
  ])

  // Step 3: Run corruption analysis with all data sources
  const corruptionResults = await runCorruptionAgent({
    plan,
    policyResults,
    spendingResults,
    donorResults,
    originalQuery: userQuery,
  })

  return {
    plan,
    policyResults,
    spendingResults,
    donorResults,
    ...corruptionResults,
  }
}
