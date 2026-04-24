// FEC bulk file column layouts (pipe-delimited, no header row).
// Source: https://www.fec.gov/campaign-finance-data/
// Pin these — the FEC occasionally adds columns and we fail-loud on drift.

export const CN = {
  // Candidate master
  columns: [
    'CAND_ID', 'CAND_NAME', 'CAND_PTY_AFFILIATION', 'CAND_ELECTION_YR',
    'CAND_OFFICE_ST', 'CAND_OFFICE', 'CAND_OFFICE_DISTRICT', 'CAND_ICI',
    'CAND_STATUS', 'CAND_PCC', 'CAND_ST1', 'CAND_ST2', 'CAND_CITY',
    'CAND_ST', 'CAND_ZIP',
  ],
  types: {
    CAND_ELECTION_YR: 'INTEGER',
  },
}

export const CM = {
  // Committee master
  columns: [
    'CMTE_ID', 'CMTE_NM', 'TRES_NM', 'CMTE_ST1', 'CMTE_ST2', 'CMTE_CITY',
    'CMTE_ST', 'CMTE_ZIP', 'CMTE_DSGN', 'CMTE_TP', 'CMTE_PTY_AFFILIATION',
    'CMTE_FILING_FREQ', 'ORG_TP', 'CONNECTED_ORG_NM', 'CAND_ID',
  ],
  types: {},
}

export const CCL = {
  // Candidate-committee linkages
  columns: [
    'CAND_ID', 'CAND_ELECTION_YR', 'FEC_ELECTION_YR', 'CMTE_ID',
    'CMTE_TP', 'CMTE_DSGN', 'LINKAGE_ID',
  ],
  types: {
    CAND_ELECTION_YR: 'INTEGER',
    FEC_ELECTION_YR:  'INTEGER',
    LINKAGE_ID:       'BIGINT',
  },
}

// Schedule A-like layout used by pas2 (committee → candidate) and oth (any committee txn)
export const PAS2 = {
  columns: [
    'CMTE_ID', 'AMNDT_IND', 'RPT_TP', 'TRANSACTION_PGI', 'IMAGE_NUM',
    'TRANSACTION_TP', 'ENTITY_TP', 'NAME', 'CITY', 'STATE', 'ZIP_CODE',
    'EMPLOYER', 'OCCUPATION', 'TRANSACTION_DT', 'TRANSACTION_AMT',
    'OTHER_ID', 'CAND_ID', 'TRAN_ID', 'FILE_NUM', 'MEMO_CD', 'MEMO_TEXT', 'SUB_ID',
  ],
  types: {
    TRANSACTION_AMT: 'DOUBLE',
    FILE_NUM:        'BIGINT',
    SUB_ID:          'BIGINT',
  },
}

export const OTH = {
  // Committee-to-committee (and misc) transactions
  columns: [
    'CMTE_ID', 'AMNDT_IND', 'RPT_TP', 'TRANSACTION_PGI', 'IMAGE_NUM',
    'TRANSACTION_TP', 'ENTITY_TP', 'NAME', 'CITY', 'STATE', 'ZIP_CODE',
    'EMPLOYER', 'OCCUPATION', 'TRANSACTION_DT', 'TRANSACTION_AMT',
    'OTHER_ID', 'TRAN_ID', 'FILE_NUM', 'MEMO_CD', 'MEMO_TEXT', 'SUB_ID',
  ],
  types: {
    TRANSACTION_AMT: 'DOUBLE',
    FILE_NUM:        'BIGINT',
    SUB_ID:          'BIGINT',
  },
}

export const WEBALL = {
  // All candidates financial summary
  columns: [
    'CAND_ID', 'CAND_NAME', 'CAND_ICI', 'PTY_CD', 'CAND_PTY_AFFILIATION',
    'TTL_RECEIPTS', 'TRANS_FROM_AUTH', 'TTL_DISB', 'TRANS_TO_AUTH',
    'COH_BOP', 'COH_COP', 'CAND_CONTRIB', 'CAND_LOANS', 'OTHER_LOANS',
    'CAND_LOAN_REPAY', 'OTHER_LOAN_REPAY', 'DEBTS_OWED_BY',
    'TTL_INDIV_CONTRIB', 'CAND_OFFICE_ST', 'CAND_OFFICE_DISTRICT',
    'SPEC_ELECTION', 'PRIM_ELECTION', 'RUN_ELECTION', 'GEN_ELECTION',
    'GEN_ELECTION_PRECENT', 'OTHER_POL_CMTE_CONTRIB', 'POL_PTY_CONTRIB',
    'CVG_END_DT', 'INDIV_REFUNDS', 'CMTE_REFUNDS',
  ],
  types: {
    PTY_CD:           'INTEGER',
    TTL_RECEIPTS:     'DOUBLE', TRANS_FROM_AUTH: 'DOUBLE', TTL_DISB: 'DOUBLE',
    TRANS_TO_AUTH:    'DOUBLE', COH_BOP: 'DOUBLE', COH_COP: 'DOUBLE',
    CAND_CONTRIB:     'DOUBLE', CAND_LOANS: 'DOUBLE', OTHER_LOANS: 'DOUBLE',
    CAND_LOAN_REPAY:  'DOUBLE', OTHER_LOAN_REPAY: 'DOUBLE', DEBTS_OWED_BY: 'DOUBLE',
    TTL_INDIV_CONTRIB:'DOUBLE', GEN_ELECTION_PRECENT: 'DOUBLE',
    OTHER_POL_CMTE_CONTRIB: 'DOUBLE', POL_PTY_CONTRIB: 'DOUBLE',
    INDIV_REFUNDS: 'DOUBLE', CMTE_REFUNDS: 'DOUBLE',
  },
}

export const WEBK = {
  // PAC and party committee financial summary
  columns: [
    'CMTE_ID', 'CMTE_NM', 'CMTE_TP', 'CMTE_DSGN', 'CMTE_FILING_FREQ',
    'TTL_RECEIPTS', 'TRANS_FROM_AFF', 'INDV_CONTRIB', 'OTHER_POL_CMTE_CONTRIB',
    'CAND_CONTRIB', 'CAND_LOANS', 'TTL_LOANS_RECEIVED', 'TTL_DISB',
    'TRANSF_TO_AFF', 'INDV_REFUNDS', 'OTHER_POL_CMTE_REFUNDS',
    'CAND_LOAN_REPAY', 'LOAN_REPAY', 'COH_BOP', 'COH_COP', 'DEBTS_OWED_BY',
    'NONFED_TRANS_RECEIVED', 'CONTRIB_TO_OTHER_CMTE', 'IND_EXP',
    'PTY_COORD_EXP', 'NONFED_SHARE_EXP', 'CVG_END_DT',
  ],
  types: {
    TTL_RECEIPTS: 'DOUBLE', TRANS_FROM_AFF: 'DOUBLE', INDV_CONTRIB: 'DOUBLE',
    OTHER_POL_CMTE_CONTRIB: 'DOUBLE', CAND_CONTRIB: 'DOUBLE', CAND_LOANS: 'DOUBLE',
    TTL_LOANS_RECEIVED: 'DOUBLE', TTL_DISB: 'DOUBLE', TRANSF_TO_AFF: 'DOUBLE',
    INDV_REFUNDS: 'DOUBLE', OTHER_POL_CMTE_REFUNDS: 'DOUBLE',
    CAND_LOAN_REPAY: 'DOUBLE', LOAN_REPAY: 'DOUBLE', COH_BOP: 'DOUBLE',
    COH_COP: 'DOUBLE', DEBTS_OWED_BY: 'DOUBLE', NONFED_TRANS_RECEIVED: 'DOUBLE',
    CONTRIB_TO_OTHER_CMTE: 'DOUBLE', IND_EXP: 'DOUBLE',
    PTY_COORD_EXP: 'DOUBLE', NONFED_SHARE_EXP: 'DOUBLE',
  },
}

export const WEBL = {
  // House/Senate current campaigns
  columns: [
    'CAND_ID', 'CAND_NAME', 'CAND_ICI', 'PTY_CD', 'CAND_PTY_AFFILIATION',
    'TTL_RECEIPTS', 'TRANS_FROM_AUTH', 'TTL_DISB', 'TRANS_TO_AUTH',
    'COH_BOP', 'COH_COP', 'CAND_CONTRIB', 'CAND_LOANS', 'OTHER_LOANS',
    'CAND_LOAN_REPAY', 'OTHER_LOAN_REPAY', 'DEBTS_OWED_BY',
    'TTL_INDIV_CONTRIB', 'CAND_OFFICE_ST', 'CAND_OFFICE_DISTRICT',
    'SPEC_ELECTION', 'PRIM_ELECTION', 'RUN_ELECTION', 'GEN_ELECTION',
    'GEN_ELECTION_PRECENT', 'OTHER_POL_CMTE_CONTRIB', 'POL_PTY_CONTRIB',
    'CVG_END_DT', 'INDIV_REFUNDS', 'CMTE_REFUNDS',
  ],
  types: {
    // same as WEBALL
    ...Object.fromEntries(Object.entries({
      TTL_RECEIPTS: 'DOUBLE', TRANS_FROM_AUTH: 'DOUBLE', TTL_DISB: 'DOUBLE',
      TRANS_TO_AUTH: 'DOUBLE', COH_BOP: 'DOUBLE', COH_COP: 'DOUBLE',
      CAND_CONTRIB: 'DOUBLE', CAND_LOANS: 'DOUBLE', OTHER_LOANS: 'DOUBLE',
      CAND_LOAN_REPAY: 'DOUBLE', OTHER_LOAN_REPAY: 'DOUBLE', DEBTS_OWED_BY: 'DOUBLE',
      TTL_INDIV_CONTRIB: 'DOUBLE', GEN_ELECTION_PRECENT: 'DOUBLE',
      OTHER_POL_CMTE_CONTRIB: 'DOUBLE', POL_PTY_CONTRIB: 'DOUBLE',
      INDIV_REFUNDS: 'DOUBLE', CMTE_REFUNDS: 'DOUBLE',
    })),
  },
}

// FEC individual contributions (indiv). Huge — streamed, filtered ≥$200 for hot tier.
export const INDIV = {
  columns: [
    'CMTE_ID', 'AMNDT_IND', 'RPT_TP', 'TRANSACTION_PGI', 'IMAGE_NUM',
    'TRANSACTION_TP', 'ENTITY_TP', 'NAME', 'CITY', 'STATE', 'ZIP_CODE',
    'EMPLOYER', 'OCCUPATION', 'TRANSACTION_DT', 'TRANSACTION_AMT',
    'OTHER_ID', 'TRAN_ID', 'FILE_NUM', 'MEMO_CD', 'MEMO_TEXT', 'SUB_ID',
  ],
  types: {
    TRANSACTION_AMT: 'DOUBLE',
    FILE_NUM:        'BIGINT',
    SUB_ID:          'BIGINT',
  },
}

export const OPPEXP = {
  // Operating expenditures
  columns: [
    'CMTE_ID', 'AMNDT_IND', 'RPT_YR', 'RPT_TP', 'IMAGE_NUM', 'LINE_NUM',
    'FORM_TP_CD', 'SCHED_TP_CD', 'NAME', 'CITY', 'STATE', 'ZIP_CODE',
    'TRANSACTION_DT', 'TRANSACTION_AMT', 'TRANSACTION_PGI', 'PURPOSE',
    'CATEGORY', 'CATEGORY_DESC', 'MEMO_CD', 'MEMO_TEXT', 'ENTITY_TP',
    'SUB_ID', 'FILE_NUM', 'TRAN_ID', 'BACK_REF_TRAN_ID',
  ],
  types: {
    RPT_YR: 'INTEGER',
    TRANSACTION_AMT: 'DOUBLE',
    FILE_NUM: 'BIGINT',
    SUB_ID:   'BIGINT',
  },
}

// ─── Phase 4 schemas ─────────────────────────────────────────────────────────

// FEC Schedule E — Independent Expenditures.
// Bulk file: https://www.fec.gov/files/bulk-downloads/{cycle}/independent_expenditure{yy}.zip
// See: https://www.fec.gov/campaign-finance-data/independent-expenditures-file-description/
export const IE = {
  columns: [
    'CMTE_ID', 'AMNDT_IND', 'RPT_YR', 'RPT_TP', 'IMAGE_NUM', 'LINE_NUM',
    'FORM_TP_CD', 'SCHED_TP_CD', 'CAND_ID', 'CAND_NM', 'CAND_PTY_AFFILIATION',
    'CAND_OFFICE_DISTRICT', 'CAND_OFFICE_ST', 'CAND_OFFICE', 'CAND_ELECTION_YR',
    'CATG_CD', 'CATG_DESC', 'S_O_IND', 'TRANSACTION_DT', 'TRANSACTION_AMT',
    'PAYEE_NM', 'PAYEE_ST1', 'PAYEE_ST2', 'PAYEE_CITY', 'PAYEE_ST', 'PAYEE_ZIP',
    'ENTITY_TP', 'ELECTION_TP', 'FECFILE_ELECTION_TP', 'FILE_NUM',
    'TRAN_ID', 'BACK_REF_TRAN_ID', 'SUB_ID', 'ACTION_CD',
  ],
  types: {
    RPT_YR:          'INTEGER',
    CAND_ELECTION_YR:'INTEGER',
    TRANSACTION_AMT: 'DOUBLE',
    FILE_NUM:        'BIGINT',
    SUB_ID:          'BIGINT',
  },
}

// FEC Electioneering Communications.
// Bulk file: https://www.fec.gov/files/bulk-downloads/{cycle}/electioneering{yy}.zip
// See: https://www.fec.gov/campaign-finance-data/electioneering-communications-file-description/
export const ELECTIONEERING = {
  columns: [
    'SUB_ID', 'CMTE_ID', 'CMTE_NM', 'RECEIPT_DT', 'FILED_DT',
    'FIRST_LAST_ELECTION_DT', 'LAST_ELECTION_DT', 'ENTITY_TP',
    'CAND_ID', 'CAND_NM', 'CAND_OFFICE', 'CAND_OFFICE_ST', 'CAND_OFFICE_DISTRICT',
    'PAYEE_NM', 'PURPOSE', 'AMT_OF_COMM', 'FEC_ELECTION_YR',
    'FILE_NUM', 'TRAN_ID',
  ],
  types: {
    AMT_OF_COMM:     'DOUBLE',
    FEC_ELECTION_YR: 'INTEGER',
    FILE_NUM:        'BIGINT',
    SUB_ID:          'BIGINT',
  },
}

// FEC Communication Costs (corp/union direct communications).
// Bulk file: https://www.fec.gov/files/bulk-downloads/{cycle}/comm_csts_ex{yy}.zip
// See: https://www.fec.gov/campaign-finance-data/communication-costs-file-description/
export const COMM_COSTS = {
  columns: [
    'CMTE_ID', 'AMNDT_IND', 'RPT_TP', 'IMAGE_NUM', 'LINE_NUM',
    'FORM_TP_CD', 'SCHED_TP_CD', 'CAND_ID', 'CAND_NM', 'CAND_PTY_AFFILIATION',
    'CAND_OFFICE_DISTRICT', 'CAND_OFFICE_ST', 'CAND_OFFICE', 'CAND_ELECTION_YR',
    'CATG_CD', 'CATG_DESC', 'S_O_IND', 'TRANSACTION_DT', 'TRANSACTION_AMT',
    'FILE_NUM', 'TRAN_ID', 'SUB_ID',
  ],
  types: {
    CAND_ELECTION_YR:'INTEGER',
    TRANSACTION_AMT: 'DOUBLE',
    FILE_NUM:        'BIGINT',
    SUB_ID:          'BIGINT',
  },
}

// FEC Lobbyist/Registrant Bundled Contributions.
// Bulk file: https://www.fec.gov/files/bulk-downloads/{cycle}/lobbyist_bundle{yy}.zip
// See: https://www.fec.gov/campaign-finance-data/lobbyist-bundler-file-description/
export const LOBBYIST_BUNDLE = {
  columns: [
    'CMTE_ID', 'CMTE_NM', 'LOBBYIST_REG_NM', 'REG_ID',
    'CAND_ID', 'CAND_NM', 'BUNDLED_FROM_DT', 'BUNDLED_TO_DT',
    'BUNDLED_AMT', 'CONTRIB_CNT', 'RPT_YR', 'RPT_TP',
    'FILE_NUM', 'TRAN_ID', 'IMAGE_NUM',
  ],
  types: {
    BUNDLED_AMT: 'DOUBLE',
    CONTRIB_CNT: 'INTEGER',
    RPT_YR:      'INTEGER',
    FILE_NUM:    'BIGINT',
  },
}

// FEC bulk file URL helper.
// Pattern: https://www.fec.gov/files/bulk-downloads/{YYYY}/{prefix}{YY}.zip
export function bulkUrl(prefix, cycle) {
  const yy = String(cycle).slice(-2)
  return `https://www.fec.gov/files/bulk-downloads/${cycle}/${prefix}${yy}.zip`
}

// Inner filename is the same prefix+YY with the .txt extension, except some files.
export function bulkInnerFilename(prefix, cycle) {
  const yy = String(cycle).slice(-2)
  return `${prefix}${yy}.txt`
}
