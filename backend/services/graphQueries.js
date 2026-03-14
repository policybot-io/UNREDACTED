/** Neo4j graph query service for corruption pattern detection. */
import neo4j from 'neo4j-driver'

let driver

function getDriver() {
  if (!driver) {
    // Read lazily so dotenv.config() has already run by this point
    const uri      = process.env.NEO4J_URI      || 'bolt://localhost:7687'
    const user     = process.env.NEO4J_USERNAME  || process.env.NEO4J_USER || 'neo4j'
    const password = process.env.NEO4J_PASSWORD  || 'password'
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  }
  return driver
}

export async function closeDriver() {
  if (driver) {
    await driver.close()
    driver = null
  }
}

/**
 * Find companies that donate to politicians who oversee agencies awarding them contracts
 * The core "quid pro quo" pattern
 */
export async function findQuidProQuoPaths({ agencyName, minAmount = 100000, lookbackMonths = 12 }) {
  let session
  try {
    session = getDriver().session()
    const result = await session.run(`
      MATCH path = (c:Company)-[:RECEIVED]->(contract:Contract)<-[:AWARDED]-(a:Agency)<-[:OVERSEES]-(comm:Committee)<-[:SITS_ON]-(p:Politician)
      WHERE (a.name CONTAINS $agencyName OR $agencyName = '')
        AND contract.award_date >= date() - duration({months: $lookbackMonths})
        AND coalesce(contract.award_amount, 0) >= $minAmount
      WITH c, p, a, comm,
           count(contract) as contractCount,
           sum(coalesce(contract.award_amount, 0)) as totalAmount
      RETURN {
        company: c.name,
        politician: p.name,
        agency: a.name,
        committee: comm.name,
        contractCount: contractCount,
        totalAmount: totalAmount,
        donorLink: exists((c)-[:PAC_DONATED]->(p))
      } as pattern
      ORDER BY totalAmount DESC
      LIMIT 20
    `, { agencyName, minAmount: neo4j.int(minAmount), lookbackMonths: neo4j.int(lookbackMonths) })

    return result.records.map(r => r.get('pattern'))
  } catch (e) {
    console.warn('[graphQueries] findQuidProQuoPaths unavailable:', e.message.slice(0, 100))
    return []
  } finally {
    if (session) await session.close()
  }
}

/**
 * Get spending network for a company
 */
export async function getCompanyNetwork(normalizedName, depth = 2) {
  let session
  try {
    session = getDriver().session()
    const result = await session.run(`
      MATCH path = (c:Company {normalized_name: $normalizedName})-[:RECEIVED|SIMILAR_TO*1..$depth]-(related)
      WITH c, related, relationships(path) as rels
      RETURN {
        company: c.name,
        relatedEntity: related.normalized_name,
        relatedType: labels(related)[0],
        relationshipTypes: [r in rels | type(r)],
        pathLength: length(path)
      } as connection
      ORDER BY pathLength
      LIMIT 50
    `, { normalizedName, depth: neo4j.int(depth) })

    return result.records.map(r => r.get('connection'))
  } catch (e) {
    console.warn('[graphQueries] getCompanyNetwork unavailable:', e.message.slice(0, 100))
    return []
  } finally {
    if (session) await session.close()
  }
}

/**
 * Get top contractors by agency
 */
export async function getTopContractorsByAgency(agencyName, limit = 20) {
  let session
  try {
    session = getDriver().session()
    const result = await session.run(`
      MATCH (c:Company)-[:RECEIVED]->(contract:Contract)<-[:AWARDED]-(a:Agency {name: $agencyName})
      WITH c, sum(coalesce(contract.award_amount, 0)) as totalAmount, count(contract) as contractCount
      RETURN {
        company: c.name,
        totalAmount: totalAmount,
        contractCount: contractCount,
        avgContractAmount: CASE WHEN contractCount > 0 THEN totalAmount / contractCount ELSE 0 END
      } as contractor
      ORDER BY totalAmount DESC
      LIMIT $limit
    `, { agencyName, limit: neo4j.int(limit) })

    return result.records.map(r => r.get('contractor'))
  } catch (e) {
    console.warn('[graphQueries] getTopContractorsByAgency unavailable:', e.message.slice(0, 100))
    return []
  } finally {
    if (session) await session.close()
  }
}

/**
 * Find regulatory patterns (agency rules related to companies)
 */
export async function findRegulatoryPatterns({ companyName, lookbackMonths = 12 }) {
  let session
  try {
    session = getDriver().session()
    const result = await session.run(`
      MATCH (c:Company {normalized_name: $companyName})
      MATCH (c)-[:RECEIVED]->(contract:Contract)<-[:AWARDED]-(a:Agency)
      MATCH (a)-[:ISSUED]->(r:Regulation)
      WHERE r.publication_date >= date() - duration({months: $lookbackMonths})
      RETURN {
        company: c.name,
        agency: a.name,
        ruleTitle: r.title,
        ruleType: r.type,
        publicationDate: r.publication_date,
        significant: r.significant,
        totalContracts: count(contract),
        totalAmount: sum(coalesce(contract.award_amount, 0))
      } as pattern
      ORDER BY r.publication_date DESC
    `, { companyName, lookbackMonths: neo4j.int(lookbackMonths) })

    return result.records.map(r => r.get('pattern'))
  } catch (e) {
    console.warn('[graphQueries] findRegulatoryPatterns unavailable:', e.message.slice(0, 100))
    return []
  } finally {
    if (session) await session.close()
  }
}

/**
 * Get corruption risk score for a company
 */
export async function getCompanyRiskScore(normalizedName) {
  let session
  try {
    session = getDriver().session()
    // Calculate risk based on multiple factors
    const result = await session.run(`
      MATCH (c:Company {normalized_name: $normalizedName})

      // Get total spending
      OPTIONAL MATCH (c)-[:RECEIVED]->(contract:Contract)
      WITH c, sum(contract.amount) as totalSpending

      // Check for sole-source patterns
      OPTIONAL MATCH (c)-[:RECEIVED]->(c2:Contract)
      WITH c, totalSpending, count(c2) as contractCount

      // Check for significant regulations
      OPTIONAL MATCH (c)-[:RECEIVED]->(:Contract)<-[:AWARDED]-(a:Agency)-[:ISSUED]->(r:Regulation)
      WHERE r.significant = true
      WITH c, totalSpending, contractCount, count(r) as significantRules

      // Check for donor connections
      OPTIONAL MATCH (c)-[:PAC_DONATED]->(p:Politician)
      WITH c, totalSpending, contractCount, significantRules, count(p) as politicianConnections

      RETURN {
        company: c.name,
        totalSpending: totalSpending,
        contractCount: contractCount,
        significantRules: significantRules,
        politicianConnections: politicianConnections,
        riskScore: CASE
          WHEN totalSpending > 100000000 AND significantRules > 0 AND politicianConnections > 0 THEN 85
          WHEN totalSpending > 50000000 AND (significantRules > 0 OR politicianConnections > 0) THEN 70
          WHEN totalSpending > 10000000 THEN 50
          ELSE 25
        END
      } as risk
    `, { normalizedName })

    return result.records[0]?.get('risk') || {
      company: normalizedName,
      totalSpending: 0,
      contractCount: 0,
      significantRules: 0,
      politicianConnections: 0,
      riskScore: 0
    }
  } catch (e) {
    console.warn('[graphQueries] getCompanyRiskScore unavailable:', e.message.slice(0, 100))
    return { company: normalizedName, totalSpending: 0, contractCount: 0, significantRules: 0, politicianConnections: 0, riskScore: 0 }
  } finally {
    if (session) await session.close()
  }
}

/**
 * Search for patterns matching a query
 */
export async function searchGraphPatterns(query) {
  // Simple pattern detection based on query keywords
  const keywords = query.toLowerCase()

  if (keywords.includes('quid pro quo') || keywords.includes('donation') && keywords.includes('contract')) {
    return findQuidProQuoPaths({ agencyName: '', minAmount: 100000 })
  }

  if (keywords.includes('regulatory') || keywords.includes('rule') && keywords.includes('company')) {
    // Extract company name if present
    const match = keywords.match(/([a-z]+(?:\s+[a-z]+){0,3})/i)
    if (match) {
      return findRegulatoryPatterns({ companyName: match[1] })
    }
  }

  return []
}
