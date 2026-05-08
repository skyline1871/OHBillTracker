/**
 * osdk-app/src/lib/foundry.ts
 *
 * OSDK client initialization and typed helper functions.
 *
 * Prerequisites (run in osdk-app/):
 *   npm install @osdk/client @osdk/oauth @osdk/react
 *
 * Replace YOUR_FOUNDRY_URL and YOUR_CLIENT_ID with values from
 * Developer Console → your application → Settings.
 */

import { createClient } from "@osdk/client";
import { createPublicOauthClient } from "@osdk/oauth";

// ── Configuration ─────────────────────────────────────────────────────────────
// These values come from Developer Console → your app → Settings
const FOUNDRY_URL = import.meta.env.VITE_FOUNDRY_URL as string;
const CLIENT_ID   = import.meta.env.VITE_CLIENT_ID as string;

// ── OAuth client (handles Multipass SSO automatically) ────────────────────────
export const auth = createPublicOauthClient(CLIENT_ID, FOUNDRY_URL, {
  // Redirect back to the app after login
  redirectUrl: window.location.origin,
});

// ── OSDK client ───────────────────────────────────────────────────────────────
export const client = createClient(
  FOUNDRY_URL,
  "ri.third-party-applications.main.application.YOUR_APP_RID", // from Developer Console
  auth,
);

// ── Typed function callers ────────────────────────────────────────────────────

export interface BillAnalysis {
  analysisId?: string;
  verdict: "aligns" | "opposes" | "neutral";
  score: number;
  summary: string;
  rationale: string;
  topPlank: string;
  risks: string[];
  analyzedAt?: string;
  cached?: boolean;
}

export interface BillSummary {
  billId: string;
  documentNumber: string;
  longTitle: string;
  shortTitle: string;
  chamber: string;
  statusDescription: string;
  lastActionDate: string;
  ohioLegUrl: string;
}

/**
 * Calls the server-side AIP Logic function to analyze a bill.
 * First checks cache, then runs inference if no cached result.
 */
export async function analyzeBill(
  billId: string,
  partyId: string,
): Promise<BillAnalysis> {
  // 1. Check cache first
  const cached = await client.actions.getCachedAnalysis({
    billId,
    partyId,
  });
  if (cached && cached !== "null") {
    const parsed = JSON.parse(cached as string) as BillAnalysis;
    return { ...parsed, cached: true };
  }

  // 2. Run fresh analysis via AIP Logic
  const result = await client.actions.analyzeBillForParty({
    billId,
    partyId,
  });
  const parsed = JSON.parse(result as string) as BillAnalysis;
  return { ...parsed, cached: false };
}

/**
 * Searches bills via Ontology (fallback if Ohio Legislature API is unavailable).
 */
export async function searchBillsViaOntology(
  keyword: string,
  chamber: string,
  page: number,
): Promise<{ bills: BillSummary[]; totalCount: number }> {
  const result = await client.actions.getBillsByKeyword({
    keyword,
    chamber,
    page,
  });
  return JSON.parse(result as string);
}
