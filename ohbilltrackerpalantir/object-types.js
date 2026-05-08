/**
 * ONTOLOGY OBJECT TYPE DEFINITIONS
 * Ohio Legislation Intelligence Platform — Palantir Foundry
 *
 * Create these object types in your Foundry Ontology Manager.
 * Each block documents: properties, primary key, and sync source.
 */

// ─────────────────────────────────────────────────────────────
// OBJECT TYPE 1: LegBill
// API Name: leg_bill
// Description: An Ohio General Assembly bill
// Primary Key: billId (string)
// Sync Source: leg_bills dataset (Pipeline Builder)
// ─────────────────────────────────────────────────────────────
export const LegBill = {
  objectTypeApiName: "leg_bill",
  properties: {
    billId:           { type: "string",    isPrimaryKey: true },  // e.g. "HB645-136"
    documentNumber:   { type: "string" },  // e.g. "HB645"
    assembly:         { type: "string" },  // "136"
    chamber:          { type: "string" },  // "H" | "S"
    longTitle:        { type: "string" },
    shortTitle:       { type: "string" },
    statusCode:       { type: "string" },
    statusDescription:{ type: "string" },
    primarySponsor:   { type: "string" },
    committee:        { type: "string" },
    introducedDate:   { type: "timestamp" },
    lastActionDate:   { type: "timestamp" },
    ohioLegUrl:       { type: "string" },
    fullTextHash:     { type: "string" },  // SHA-256 of latest version
    fullTextSummary:  { type: "string" },  // Extracted plain text (first 4000 chars)
  },
  links: {
    analyses: {
      objectType: "leg_analysis",
      cardinality: "ONE_TO_MANY",
      foreignKey: "billId",
    },
  },
};

// ─────────────────────────────────────────────────────────────
// OBJECT TYPE 2: LegAnalysis
// API Name: leg_analysis
// Description: AI-generated alignment analysis for a bill × party
// Primary Key: analysisId (string)
// Sync Source: leg_analyses dataset (written by AIP Logic function)
// ─────────────────────────────────────────────────────────────
export const LegAnalysis = {
  objectTypeApiName: "leg_analysis",
  properties: {
    analysisId:    { type: "string", isPrimaryKey: true }, // "{billId}_{partyId}"
    billId:        { type: "string" },
    partyId:       { type: "string" },   // "republican" | "democrat" | "libertarian"
    verdict:       { type: "string" },   // "aligns" | "opposes" | "neutral"
    score:         { type: "double" },   // 0.0–1.0 confidence
    summary:       { type: "string" },
    rationale:     { type: "string" },
    topPlank:      { type: "string" },
    risks:         { type: "string" },   // JSON array stored as string
    analyzedAt:    { type: "timestamp" },
    modelVersion:  { type: "string" },   // e.g. "claude-3-5-sonnet"
  },
  links: {
    bill: {
      objectType: "leg_bill",
      cardinality: "MANY_TO_ONE",
      foreignKey: "billId",
    },
  },
};

// ─────────────────────────────────────────────────────────────
// OBJECT TYPE 3: LegPlatformPlank
// API Name: leg_platform_plank
// Description: A single platform plank for a party
// Primary Key: plankId (string)
// Sync Source: Manually managed dataset or inline seed data
// ─────────────────────────────────────────────────────────────
export const LegPlatformPlank = {
  objectTypeApiName: "leg_platform_plank",
  properties: {
    plankId:     { type: "string", isPrimaryKey: true },  // e.g. "republican_1"
    partyId:     { type: "string" },
    partyName:   { type: "string" },
    plankText:   { type: "string" },
    sortOrder:   { type: "integer" },
  },
};

// ─────────────────────────────────────────────────────────────
// OBJECT TYPE 4: LegCommittee
// API Name: leg_committee
// Description: An Ohio Legislature committee
// Primary Key: committeeId (string)
// ─────────────────────────────────────────────────────────────
export const LegCommittee = {
  objectTypeApiName: "leg_committee",
  properties: {
    committeeId:  { type: "string", isPrimaryKey: true },
    name:         { type: "string" },
    chamber:      { type: "string" },
    chair:        { type: "string" },
  },
};
