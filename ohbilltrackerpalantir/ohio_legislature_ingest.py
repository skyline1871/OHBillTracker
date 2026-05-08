"""
PIPELINE BUILDER TRANSFORM
File: transforms/ohio_legislature_ingest.py

Deploy in: Foundry → Pipeline Builder → New Transform → Python
Schedule:  Daily at 6:00 AM via Scheduler

This transform:
  1. Fetches bills from Ohio Legislature API (136th GA)
  2. Writes/updates rows in leg_bills dataset
  3. Rate-limited to 1 req/2 sec per LegiTracker spec

Output datasets:
  - leg_bills          (primary bill records)
  - leg_bills_log      (ingestion run log)
"""

from transforms.api import transform, Output, Input, incremental
from pyspark.sql import functions as F, types as T
import requests
import time
import hashlib
import json
from datetime import datetime, timezone


OHIO_API_BASE = "https://search-prod.lis.state.oh.us/api/v2"
ASSEMBLY = "136"
RATE_LIMIT_SECS = 2      # 1 request per 2 seconds
PAGE_SIZE = 50
MAX_PAGES = 100          # cap at 5000 bills per run; increase as needed


@transform(
    leg_bills=Output("/ohio-legitrack/datasets/leg_bills"),
    run_log=Output("/ohio-legitrack/datasets/leg_bills_log"),
)
def compute(leg_bills, run_log):
    """Main ingestion entry point."""

    bills = []
    errors = []
    run_start = datetime.now(timezone.utc).isoformat()

    for chamber in ["H", "S"]:
        page = 1
        while page <= MAX_PAGES:
            url = (
                f"{OHIO_API_BASE}/documents"
                f"?assembly={ASSEMBLY}"
                f"&chamber={chamber}"
                f"&documentType=B"
                f"&pageSize={PAGE_SIZE}"
                f"&page={page}"
            )
            try:
                resp = requests.get(url, timeout=30, headers={"Accept": "application/json"})
                resp.raise_for_status()
                data = resp.json()
                docs = data.get("documents", [])

                if not docs:
                    break  # No more pages

                for doc in docs:
                    bill_id = f"{doc.get('documentNumber', '')}-{ASSEMBLY}"
                    bills.append({
                        "billId":             bill_id,
                        "documentNumber":     doc.get("documentNumber", ""),
                        "assembly":           ASSEMBLY,
                        "chamber":            chamber,
                        "longTitle":          doc.get("longTitle", ""),
                        "shortTitle":         doc.get("shortTitle", ""),
                        "statusCode":         str(doc.get("statusCode", "")),
                        "statusDescription":  doc.get("statusDescription", ""),
                        "primarySponsor":     _extract_sponsor(doc),
                        "committee":          doc.get("committee", {}).get("name", "") if isinstance(doc.get("committee"), dict) else "",
                        "introducedDate":     _parse_date(doc.get("introducedDate")),
                        "lastActionDate":     _parse_date(doc.get("lastActionDate") or doc.get("statusDate")),
                        "ohioLegUrl":         f"https://www.legislature.ohio.gov/legislation/{ASSEMBLY}/{doc.get('documentNumber','').lower()}",
                        "fullTextHash":       "",   # Populated by separate PDF pipeline
                        "fullTextSummary":    "",   # Populated by separate embedding pipeline
                        "ingestedAt":         run_start,
                    })

                total = data.get("totalCount", 0)
                if page * PAGE_SIZE >= total:
                    break  # Fetched all pages

                page += 1
                time.sleep(RATE_LIMIT_SECS)

            except requests.RequestException as e:
                errors.append({"chamber": chamber, "page": page, "error": str(e), "ts": datetime.now(timezone.utc).isoformat()})
                time.sleep(RATE_LIMIT_SECS * 2)
                break

    # ── Write bills dataset ──────────────────────────────────────────────────
    from pyspark.sql import SparkSession
    spark = SparkSession.builder.getOrCreate()

    bill_schema = T.StructType([
        T.StructField("billId",            T.StringType(), False),
        T.StructField("documentNumber",    T.StringType(), True),
        T.StructField("assembly",          T.StringType(), True),
        T.StructField("chamber",           T.StringType(), True),
        T.StructField("longTitle",         T.StringType(), True),
        T.StructField("shortTitle",        T.StringType(), True),
        T.StructField("statusCode",        T.StringType(), True),
        T.StructField("statusDescription", T.StringType(), True),
        T.StructField("primarySponsor",    T.StringType(), True),
        T.StructField("committee",         T.StringType(), True),
        T.StructField("introducedDate",    T.StringType(), True),
        T.StructField("lastActionDate",    T.StringType(), True),
        T.StructField("ohioLegUrl",        T.StringType(), True),
        T.StructField("fullTextHash",      T.StringType(), True),
        T.StructField("fullTextSummary",   T.StringType(), True),
        T.StructField("ingestedAt",        T.StringType(), True),
    ])

    df_bills = spark.createDataFrame(bills, schema=bill_schema)
    leg_bills.write_dataframe(df_bills)

    # ── Write run log ────────────────────────────────────────────────────────
    log_data = [{
        "runId":      hashlib.md5(run_start.encode()).hexdigest(),
        "runStart":   run_start,
        "runEnd":     datetime.now(timezone.utc).isoformat(),
        "billsFound": len(bills),
        "errors":     json.dumps(errors),
        "assembly":   ASSEMBLY,
    }]
    df_log = spark.createDataFrame(log_data)
    run_log.write_dataframe(df_log)


def _extract_sponsor(doc: dict) -> str:
    sponsors = doc.get("sponsors", [])
    if sponsors and isinstance(sponsors, list):
        s = sponsors[0]
        if isinstance(s, dict):
            return s.get("fullName", s.get("lastName", ""))
    return ""


def _parse_date(val) -> str:
    if not val:
        return ""
    if isinstance(val, str):
        return val[:10]   # trim to YYYY-MM-DD
    return str(val)
