/**
 * FOUNDRY FUNCTIONS (AIP Logic)
 * File: functions/src/index.ts
 *
 * Deploy in: Foundry → Code Repositories → New Repository (Functions template)
 * Runtime: TypeScript
 * These functions run server-side inside Foundry's trust boundary,
 * so they can call AIP-hosted LLMs without CSP restrictions.
 *
 * Register each @Function in Ontology Manager → Functions.
 */

import {
  Function,
  FunctionParam,
  OntologyObject,
  String as OString,
  Double,
  Timestamp,
} from "@foundry/functions-api";

import { Objects } from "@foundry/ontology-api";

// ── Platform plank definitions ────────────────────────────────────────────────

const PARTY_PLANKS: Record<string, string[]> = {
  republican: [
    "Lower taxes and reduce government spending",
    "Strong national defense and border security",
    "Second Amendment rights and gun ownership",
    "Free market capitalism and deregulation",
    "Traditional family values and religious freedom",
    "Pro-life policies and oppose abortion",
    "Law and order and support for law enforcement",
    "School choice and parental rights in education",
    "Energy independence including fossil fuels",
    "Oppose government mandates and overreach",
    "Veterans benefits and military support",
    "Oppose illegal immigration and enforce immigration law",
  ],
  democrat: [
    "Expand access to affordable healthcare and Medicaid",
    "Climate action and clean energy investment",
    "Worker rights, unions, and minimum wage increases",
    "Racial equity and civil rights protections",
    "Universal pre-K and affordable higher education",
    "Reproductive rights and access to abortion",
    "Common-sense gun safety regulations",
    "Immigration reform and path to citizenship",
    "LGBTQ+ rights and anti-discrimination protections",
    "Social safety net and poverty reduction programs",
    "Campaign finance reform and voting rights expansion",
    "Tax fairness and making the wealthy pay more",
  ],
  libertarian: [
    "Personal liberty and individual freedom from government interference",
    "Free markets and economic liberty, oppose excessive regulation",
    "Privacy rights and civil liberties",
    "Limited government and fiscal responsibility",
    "Oppose government surveillance and police state expansion",
    "Drug policy reform and decriminalization",
    "Second amendment and gun rights",
    "Property rights and opposition to eminent domain abuse",
    "Free speech and press freedom",
    "Opposition to corporate welfare, subsidies, and cronyism",
    "School choice and education freedom",
    "Criminal justice reform and oppose mass incarceration",
  ],
};

const PARTY_NAMES: Record<string, string> = {
  republican: "Republican",
  democrat: "Democrat",
  libertarian: "Libertarian",
};

// ── Function 1: analyzeBillForParty ──────────────────────────────────────────
/**
 * Core AIP Logic function. Sends bill text + party planks to an AIP-hosted LLM
 * and returns structured alignment analysis.
 *
 * Register in Ontology Manager as: analyzeBillForParty
 * Input:  billId (string), partyId (string)
 * Output: JSON string with { verdict, score, summary, rationale, topPlank, risks }
 */
export class LegiTrackerFunctions {

  @Function()
  public async analyzeBillForParty(
    @FunctionParam("billId") billId: OString,
    @FunctionParam("partyId") partyId: OString,
  ): Promise<OString> {

    // Load the bill object from Ontology
    const bill = await Objects.search()
      .legBill()
      .filter((b) => b.billId.exactMatch(billId))
      .all();

    if (!bill || bill.length === 0) {
      return JSON.stringify({ error: "Bill not found", billId });
    }

    const b = bill[0];
    const planks = PARTY_PLANKS[partyId] ?? PARTY_PLANKS["libertarian"];
    const partyName = PARTY_NAMES[partyId] ?? partyId;

    const prompt = `You are analyzing an Ohio state legislature bill from the perspective of the ${partyName} Party.

Bill: ${b.documentNumber} — ${b.longTitle || b.shortTitle || ""}
Status: ${b.statusDescription || ""}
${b.fullTextSummary ? `\nBill text excerpt:\n${b.fullTextSummary.slice(0, 3000)}` : ""}

${partyName} Party platform planks:
${planks.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Respond ONLY with a valid JSON object (no markdown, no backticks):
{
  "summary": "2-sentence plain-English summary of what this bill does",
  "verdict": "aligns" or "opposes" or "neutral",
  "score": 0.0 to 1.0 confidence in verdict,
  "rationale": "2-sentence analysis from the ${partyName} Party perspective citing specific planks",
  "topPlank": "the single most relevant party plank this bill relates to",
  "risks": ["concern1", "concern2", "concern3"]
}`;

    // AIP Logic — call an AIP-hosted LLM (configured in your Foundry enrollment)
    // Replace "gpt-4o" with your enrollment's available model (Claude, GPT-4, etc.)
    const { AipCompletions } = await import("@foundry/aip-completions");

    const response = await AipCompletions.complete({
      model: "claude-3-5-sonnet", // or "gpt-4o", depending on your AIP enrollment
      messages: [{ role: "user", content: prompt }],
      maxTokens: 800,
    });

    const raw = response.choices?.[0]?.message?.content ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();

    // Write result back to Ontology via Action
    try {
      const parsed = JSON.parse(clean);
      await Objects.actions().upsertLegAnalysis({
        analysisId: `${billId}_${partyId}`,
        billId: billId,
        partyId: partyId,
        verdict: parsed.verdict ?? "neutral",
        score: parsed.score ?? 0.5,
        summary: parsed.summary ?? "",
        rationale: parsed.rationale ?? "",
        topPlank: parsed.topPlank ?? "",
        risks: JSON.stringify(parsed.risks ?? []),
        analyzedAt: new Date().toISOString(),
        modelVersion: "claude-3-5-sonnet",
      });
    } catch (_) {
      // Write failure is non-fatal — client still gets the result
    }

    return clean;
  }

  // ── Function 2: getBillsByKeyword ──────────────────────────────────────────
  /**
   * Searches leg_bill objects by keyword match on title or status.
   * Used as a fallback when the React app cannot reach the Ohio API directly.
   *
   * Register as: getBillsByKeyword
   */
  @Function()
  public async getBillsByKeyword(
    @FunctionParam("keyword") keyword: OString,
    @FunctionParam("chamber") chamber: OString,
    @FunctionParam("page") page: Double,
  ): Promise<OString> {
    const pageSize = 25;
    const offset = (Math.max(1, page) - 1) * pageSize;

    let query = Objects.search().legBill();

    if (keyword && keyword.length > 1) {
      query = query.filter((b) =>
        b.longTitle.containsAllTerms(keyword)
          .or(b.shortTitle.containsAllTerms(keyword))
      );
    }

    if (chamber === "H" || chamber === "S") {
      query = query.filter((b) => b.chamber.exactMatch(chamber));
    }

    const results = await query
      .orderByDescending((b) => b.lastActionDate)
      .all();

    const paginated = results.slice(offset, offset + pageSize);

    return JSON.stringify({
      totalCount: results.length,
      page: page,
      pageSize: pageSize,
      bills: paginated.map((b) => ({
        billId: b.billId,
        documentNumber: b.documentNumber,
        longTitle: b.longTitle,
        shortTitle: b.shortTitle,
        chamber: b.chamber,
        statusDescription: b.statusDescription,
        lastActionDate: b.lastActionDate,
        ohioLegUrl: b.ohioLegUrl,
      })),
    });
  }

  // ── Function 3: getCachedAnalysis ─────────────────────────────────────────
  /**
   * Returns a cached analysis if one exists, to avoid re-calling the LLM.
   * Register as: getCachedAnalysis
   */
  @Function()
  public async getCachedAnalysis(
    @FunctionParam("billId") billId: OString,
    @FunctionParam("partyId") partyId: OString,
  ): Promise<OString> {
    const analysisId = `${billId}_${partyId}`;
    const results = await Objects.search()
      .legAnalysis()
      .filter((a) => a.analysisId.exactMatch(analysisId))
      .all();

    if (!results || results.length === 0) return "null";

    const a = results[0];
    return JSON.stringify({
      analysisId: a.analysisId,
      verdict: a.verdict,
      score: a.score,
      summary: a.summary,
      rationale: a.rationale,
      topPlank: a.topPlank,
      risks: JSON.parse(a.risks ?? "[]"),
      analyzedAt: a.analyzedAt,
    });
  }
}
