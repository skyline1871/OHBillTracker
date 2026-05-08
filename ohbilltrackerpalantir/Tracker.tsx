/**
 * osdk-app/src/components/Tracker.tsx
 *
 * Main bill tracker. Uses:
 * - Ohio Legislature JSON API directly (allowed via CSP config)
 * - Falls back to Ontology search (getBillsByKeyword function) if API unreachable
 * - Calls analyzeBillForParty AIP Logic function for AI analysis
 * - Reads getCachedAnalysis to avoid redundant LLM calls
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PARTIES, type Party } from "../lib/parties";
import { analyzeBill, searchBillsViaOntology, type BillAnalysis, type BillSummary } from "../lib/foundry";
import styles from "./Tracker.module.css";

const OHIO_API = "https://search-prod.lis.state.oh.us/api/v2";
const ASSEMBLY = "136";

interface OhioBill {
  documentId?: string;
  documentNumber: string;
  longTitle?: string;
  shortTitle?: string;
  chamberDescription?: string;
  statusDescription?: string;
}

interface Props {
  partyId: string;
  onBack: () => void;
}

export default function Tracker({ partyId, onBack }: Props) {
  const party: Party = PARTIES[partyId];
  const [bills, setBills] = useState<(OhioBill | BillSummary)[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingOntology, setUsingOntology] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [chamber, setChamber] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [analyses, setAnalyses] = useState<Record<string, BillAnalysis & { loading?: boolean }>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: "—", senate: "—", house: "—" });
  const [alignFilter, setAlignFilter] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Fetch bills from Ohio API, fall back to Ontology ─────────────────────
  const fetchBills = useCallback(async (kw: string, ch: string, pg: number) => {
    setLoading(true);
    setExpanded(null);
    try {
      let url = `${OHIO_API}/documents?assembly=${ASSEMBLY}&pageSize=25&page=${pg}&documentType=B`;
      if (kw) url += `&fulltext=${encodeURIComponent(kw)}`;
      if (ch) url += `&chamber=${ch}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      setBills(data.documents ?? []);
      setTotalCount(data.totalCount ?? 0);
      setTotalPages(Math.ceil((data.totalCount ?? 1) / 25));
      setUsingOntology(false);
    } catch {
      // Fallback: use Ontology search via OSDK function
      try {
        const result = await searchBillsViaOntology(kw, ch, pg);
        setBills(result.bills);
        setTotalCount(result.totalCount);
        setTotalPages(Math.ceil(result.totalCount / 25));
        setUsingOntology(true);
      } catch (e2) {
        console.error("Both Ohio API and Ontology fallback failed", e2);
        setBills([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBills("", "", 1); }, [fetchBills]);

  // ── Stats (total/senate/house) ────────────────────────────────────────────
  useEffect(() => {
    if (usingOntology) return;
    Promise.all([
      fetch(`${OHIO_API}/documents?assembly=${ASSEMBLY}&pageSize=1&page=1&chamber=H&documentType=B`).then(r => r.json()),
      fetch(`${OHIO_API}/documents?assembly=${ASSEMBLY}&pageSize=1&page=1&chamber=S&documentType=B`).then(r => r.json()),
    ]).then(([h, s]) => {
      setStats({
        total: ((h.totalCount ?? 0) + (s.totalCount ?? 0)).toLocaleString(),
        house: (h.totalCount ?? 0).toLocaleString(),
        senate: (s.totalCount ?? 0).toLocaleString(),
      });
    }).catch(() => {});
  }, [usingOntology]);

  // ── Analysis via AIP Logic function ──────────────────────────────────────
  useEffect(() => {
    if (!expanded) return;
    if (analyses[expanded]) return; // already have it or loading

    const bill = bills.find(b => getBillKey(b) === expanded);
    if (!bill) return;

    const billId = getBillId(bill);
    setAnalyses(prev => ({ ...prev, [expanded]: { loading: true } as any }));

    analyzeBill(billId, partyId)
      .then(result => setAnalyses(prev => ({ ...prev, [expanded]: { ...result, loading: false } })))
      .catch(() => setAnalyses(prev => ({
        ...prev,
        [expanded]: {
          loading: false,
          verdict: "neutral",
          score: 0.5,
          summary: `${getBillTitle(bill)}`,
          rationale: "Analysis unavailable. Please try again.",
          topPlank: "",
          risks: ["Unable to complete AI analysis."],
        }
      })));
  }, [expanded]);

  function getBillKey(b: OhioBill | BillSummary): string {
    return (b as OhioBill).documentId ?? (b as BillSummary).billId ?? (b as OhioBill).documentNumber ?? "";
  }

  function getBillId(b: OhioBill | BillSummary): string {
    // Prefer Ontology billId; fall back to constructing one from documentNumber + assembly
    return (b as BillSummary).billId ?? `${(b as OhioBill).documentNumber}-${ASSEMBLY}`;
  }

  function getBillTitle(b: OhioBill | BillSummary): string {
    return (b as OhioBill).longTitle ?? (b as BillSummary).longTitle ?? (b as OhioBill).shortTitle ?? "";
  }

  function isHouse(b: OhioBill | BillSummary): boolean {
    return ((b as OhioBill).documentNumber ?? "").startsWith("H")
      || ((b as OhioBill).chamberDescription ?? "").includes("House")
      || (b as BillSummary).chamber === "H";
  }

  function handleKeyword(v: string) {
    setKeyword(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchBills(v, chamber, 1); }, 500);
  }

  function handleChamber(v: string) {
    setChamber(v);
    setPage(1);
    fetchBills(keyword, v, 1);
  }

  function handleReset() {
    setKeyword(""); setChamber(""); setAlignFilter(null); setPage(1);
    fetchBills("", "", 1);
  }

  function handlePage(p: number) {
    setPage(p);
    fetchBills(keyword, chamber, p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredBills = alignFilter
    ? bills.filter(b => {
        const a = analyses[getBillKey(b)];
        if (!a || (a as any).loading) return true;
        return a.verdict === alignFilter;
      })
    : bills;

  const p = party;

  return (
    <div
      className={styles.app}
      style={{ "--p": p.primary, "--d": p.dark, "--l": p.light, "--m": p.mid, "--ton": p.textOnPrimary } as React.CSSProperties}
    >
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button className={styles.backBtn} onClick={onBack}>← Change party</button>
          <div className={styles.headerCenter}>
            <span className={styles.partyBadge} style={{ background: p.primary, color: p.textOnPrimary }}>
              {p.name}
            </span>
            <h1 className={styles.title}>Ohio Legislation Intelligence</h1>
            <p className={styles.sub}>136th General Assembly · Powered by Foundry AIP</p>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}><strong>{stats.total}</strong><span>Bills</span></div>
            <div className={styles.stat}><strong>{stats.senate}</strong><span>Senate</span></div>
            <div className={styles.stat}><strong>{stats.house}</strong><span>House</span></div>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {usingOntology && (
          <div className={styles.notice}>
            Ohio Legislature API unavailable — querying Foundry Ontology
          </div>
        )}

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search bills by keyword…"
            value={keyword}
            onChange={e => handleKeyword(e.target.value)}
          />
          <select className={styles.select} value={chamber} onChange={e => handleChamber(e.target.value)}>
            <option value="">All chambers</option>
            <option value="S">Senate</option>
            <option value="H">House</option>
          </select>
          <button className={styles.resetBtn} onClick={handleReset}>Reset</button>
        </div>

        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Filter:</span>
          {(["aligns", "neutral", "opposes"] as const).map(v => (
            <button
              key={v}
              className={`${styles.chip} ${alignFilter === v ? styles.chipActive : ""}`}
              onClick={() => setAlignFilter(prev => prev === v ? null : v)}
            >
              {v === "aligns" ? `✓ Aligns with ${p.shortName}` : v === "opposes" ? `✗ Opposes ${p.shortName}` : "⊘ Neutral"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} style={{ borderTopColor: p.primary }} />
            Loading bills…
          </div>
        ) : (
          <>
            <p className={styles.resultCount}>
              {filteredBills.length} of {totalCount.toLocaleString()} bills · Page {page} of {totalPages}
            </p>

            <div className={styles.billList}>
              {filteredBills.map(bill => {
                const key = getBillKey(bill);
                const a = analyses[key];
                const isOpen = expanded === key;
                const house = isHouse(bill);

                return (
                  <div key={key} className={`${styles.card} ${isOpen ? styles.cardOpen : ""}`}>
                    <button className={styles.cardHeader} onClick={() => setExpanded(prev => prev === key ? null : key)}>
                      <div className={styles.cardHeaderLeft}>
                        <span className={`${styles.numBadge} ${house ? styles.houseBadge : styles.senateBadge}`}>
                          {(bill as OhioBill).documentNumber ?? (bill as BillSummary).documentNumber}
                        </span>
                        <div>
                          <p className={styles.cardTitle}>{getBillTitle(bill)}</p>
                          <div className={styles.cardMeta}>
                            <span className={styles.metaTag}>{house ? "House" : "Senate"}</span>
                            {(bill as OhioBill).statusDescription && (
                              <span className={styles.metaTag}>{(bill as OhioBill).statusDescription}</span>
                            )}
                            {a && !(a as any).loading && (
                              <span className={`${styles.verdictTag} ${styles["verdict_" + a.verdict]}`}>
                                {a.verdict === "aligns" ? `✓ ${p.shortName}` : a.verdict === "opposes" ? `✗ ${p.shortName}` : "⊘ Neutral"}
                                {a.cached && " ·cached"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={styles.expandIcon}>{isOpen ? "−" : "+"}</span>
                    </button>

                    {isOpen && (
                      <div className={styles.analysis}>
                        {!a || (a as any).loading ? (
                          <div className={styles.analysisLoading}>
                            <span className={styles.dots}><span /><span /><span /></span>
                            Querying Foundry AIP Logic for {p.name} alignment…
                          </div>
                        ) : (
                          <>
                            <p className={styles.summary}>{a.summary}</p>

                            <div className={styles.verdictBlock} style={{
                              background: a.verdict === "aligns" ? "#edf7e6" : a.verdict === "opposes" ? "#fff0f0" : "#f5f5f5",
                              borderLeft: `3px solid ${a.verdict === "aligns" ? "#3d8b1a" : a.verdict === "opposes" ? "#c0392b" : "#aaa"}`,
                            }}>
                              <div className={styles.verdictRow}>
                                <strong style={{ color: a.verdict === "aligns" ? "#27500A" : a.verdict === "opposes" ? "#791F1F" : "#555" }}>
                                  {a.verdict === "aligns" ? `Aligns with ${p.name}` : a.verdict === "opposes" ? `Opposes ${p.name} values` : "Neutral / Mixed"}
                                </strong>
                                <div className={styles.scoreBar}>
                                  <div style={{
                                    width: `${Math.round((a.score ?? 0.5) * 100)}%`,
                                    background: a.verdict === "aligns" ? "#639922" : a.verdict === "opposes" ? "#E24B4A" : "#888",
                                  }} />
                                </div>
                                <span className={styles.scorePct}>{Math.round((a.score ?? 0.5) * 100)}%</span>
                              </div>
                              <p className={styles.rationale}>{a.rationale}</p>
                              {a.topPlank && <p className={styles.topPlank}>Top plank: <em>{a.topPlank}</em></p>}
                            </div>

                            {a.risks?.length > 0 && (
                              <div className={styles.risks}>
                                <p className={styles.risksTitle}>Concerns</p>
                                {a.risks.map((r, i) => (
                                  <div key={i} className={styles.riskItem}>
                                    <span style={{ background: p.primary }} className={styles.riskDot} />
                                    {r}
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className={styles.links}>
                              <a
                                href={`https://www.legislature.ohio.gov/legislation/${ASSEMBLY}/${((bill as OhioBill).documentNumber ?? "").toLowerCase()}`}
                                target="_blank" rel="noreferrer"
                                className={styles.link}
                                style={{ color: p.primary === "#FFCC00" ? p.dark : p.primary }}
                              >
                                View on Ohio Legislature →
                              </a>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.pagination}>
              {page > 1 && <button className={styles.pageBtn} onClick={() => handlePage(page - 1)}>← Prev</button>}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const num = start + i;
                return num <= totalPages ? (
                  <button
                    key={num}
                    className={`${styles.pageBtn} ${num === page ? styles.pageBtnActive : ""}`}
                    onClick={() => handlePage(num)}
                    style={num === page ? { background: p.primary, color: p.textOnPrimary, borderColor: p.primary } : {}}
                  >
                    {num}
                  </button>
                ) : null;
              })}
              {page < totalPages && <button className={styles.pageBtn} onClick={() => handlePage(page + 1)}>Next →</button>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
