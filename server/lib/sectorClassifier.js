/**
 * Keyword-based sector classifier for FEC contributor_employer strings.
 * Employer is a self-reported raw string (e.g. "GOLDMAN SACHS & CO", "RETIRED").
 * We match on LOWER(employer) in priority order — first match wins.
 */

const SECTOR_MAP = [
  ['Retired / Inactive', ['retired', 'not employed', 'self-employed', 'homemaker', 'self employed', 'unemployed', 'none', 'n/a']],
  ['Finance',            ['goldman', 'jpmorgan', 'jp morgan', 'morgan stanley', 'bank of america', 'citigroup', 'citibank', 'wells fargo', 'blackrock', 'blackstone', 'citadel', 'bridgewater', 'renaissance', 'two sigma', 'vanguard', 'fidelity', 'schwab', 'merrill', 'lehman', 'bear stearns', 'hedge fund', 'private equity', 'asset management', 'investment bank', 'securities', 'financial group', 'financial corp', 'financial services', 'capital management', 'capital group', 'capital partners', 'venture capital', ' bank', 'bancorp', 'bancshares', 'bankers', 'banking']],
  ['Technology',         ['google', 'alphabet', 'apple inc', 'microsoft', 'amazon', 'meta ', 'facebook', 'netflix', 'tesla', 'nvidia', 'intel ', 'amd', 'qualcomm', 'broadcom', 'oracle', 'salesforce', 'sap ', 'ibm', 'cisco', 'vmware', 'palantir', 'snowflake', 'airbnb', 'uber', 'lyft', 'twitter', 'linkedin', 'software', 'tech corp', 'tech inc', 'technology', 'semiconductor', 'cloud', 'cybersecurity', 'startup', 'venture']],
  ['Healthcare',         ['unitedhealth', 'anthem', 'cigna', 'aetna', 'humana', 'cvs health', 'walgreens', 'pfizer', 'johnson & johnson', 'merck', 'abbott', 'abbvie', 'eli lilly', 'bristol myers', 'gilead', 'amgen', 'biogen', 'moderna', 'hospital', 'health system', 'health network', 'medical center', 'medical group', 'physicians', 'healthcare', 'health care', 'pharma', 'biotech', 'clinical', 'dental', 'doctor', 'physician', 'surgeon', 'nursing']],
  ['Energy',             ['exxon', 'chevron', 'bp ', 'shell ', 'conocophillips', 'marathon oil', 'pioneer natural', 'devon energy', 'halliburton', 'schlumberger', 'baker hughes', 'oil ', 'gas company', 'gas corp', 'petroleum', 'petro', 'energy corp', 'energy company', 'energy inc', 'coal ', 'mining', 'pipeline', 'refining', 'utilities', 'electric company', 'electric corp', 'power company', 'power corp', 'renewable energy', 'solar', 'wind energy', 'nuclear']],
  ['Legal',              ['law firm', 'law office', 'law group', ' llp', ' lllp', 'attorney', 'attorneys', 'counsel', 'esquire', 'legal services', 'litigation', 'law school', 'judge', 'public defender', 'prosecutor', 'district attorney', 'solicitor']],
  ['Real Estate',        ['real estate', 'realty', 'realtors', 'properties llc', 'properties inc', 'property group', 'property mgmt', 'property management', 'developer', 'development corp', 'development company', 'construction', 'homebuilders', 'cbre', 'jll', 'cushman']],
  ['Defense',            ['lockheed', 'boeing', 'raytheon', 'northrop', 'general dynamics', 'l3harris', 'bae systems', 'leidos', 'saic', 'booz allen', 'defense', 'aerospace', 'military', 'army', 'navy', 'air force', 'pentagon', 'contractor']],
  ['Media & Entertainment', ['disney', 'comcast', 'nbc', 'cbs ', 'abc ', 'fox corp', 'foxnews', 'viacom', 'paramount', 'warner', 'sony', 'netflix', 'hbo', 'iheartmedia', 'clear channel', 'news corp', 'new york times', 'washington post', 'media', 'entertainment', 'publishing', 'television', 'broadcast', 'radio', 'streaming', 'magazine', 'newspaper']],
  ['Education',          ['university', 'college', 'school district', 'school board', 'academy', 'institute of technology', 'community college', 'public school', 'educator', 'teacher', 'professor', 'faculty', 'education dept', 'department of education']],
  ['Labor / Unions',     ['union', 'afl-cio', 'teamsters', 'seiu', 'afscme', 'ufcw', 'iam ', 'ibew', 'uaw ', 'cwa ', 'postal workers', 'firefighters union', 'police union', 'teachers union', 'labor federation', 'workers union']],
  ['Consulting',         ['mckinsey', 'deloitte', 'accenture', 'kpmg', 'pwc ', 'ernst & young', 'ey ', 'bain ', 'bain and company', 'boston consulting', 'bcg ', 'a.t. kearney', 'management consulting', 'consulting group', 'consulting firm', 'consulting llc', 'advisory', 'advisors', 'strategy group']],
  ['Government / Politics', ['campaign', 'political committee', 'pac ', 'democratic', 'republican', 'government', 'federal', 'state of ', 'county of ', 'city of ', 'congress', 'senate ', 'house of rep', 'elected', 'commissioner', 'legislat']],
]

/**
 * Classify an employer string into a sector.
 * @param {string|null} employer - Raw contributor_employer value
 * @returns {string} Sector name, or 'Other'
 */
export function classifySector(employer) {
  if (!employer) return 'Other'
  const s = employer.toLowerCase().trim()
  if (!s) return 'Other'
  for (const [sector, keywords] of SECTOR_MAP) {
    for (const kw of keywords) {
      if (s.includes(kw)) return sector
    }
  }
  return 'Other'
}
