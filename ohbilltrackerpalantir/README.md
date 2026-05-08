# Ohio Legislation Intelligence Platform
## Palantir Foundry — Complete Deployment Guide

---

## Repository Structure

```
legitrack-foundry/
├── ontology/
│   └── object-types.js          ← Ontology schema reference
├── functions/
│   ├── src/index.ts             ← AIP Logic TypeScript functions
│   ├── package.json
│   └── transforms/
│       └── ohio_legislature_ingest.py  ← Pipeline Builder transform
├── osdk-app/
│   ├── src/
│   │   ├── App.tsx              ← Root component (OsdkProvider wrapper)
│   │   ├── index.css            ← Global styles + Google Fonts
│   │   ├── lib/
│   │   │   ├── foundry.ts       ← OSDK client + function callers
│   │   │   └── parties.ts       ← Party config + platform planks
│   │   └── components/
│   │       ├── PartySelect.tsx  ← Party selection onboarding screen
│   │       ├── PartySelect.module.css
│   │       ├── Tracker.tsx      ← Main bill tracker
│   │       └── Tracker.module.css
│   ├── package.json
│   └── vite.config.ts
└── docs/
    └── IMPLEMENTATION_GUIDE.md
```

---

## Step 1: Ontology Setup (Ontology Manager)

Create the following Object Types in Ontology Manager:

| API Name           | Primary Key  | Sync Source                     |
|--------------------|--------------|----------------------------------|
| `leg_bill`         | `billId`     | `/ohio-legitrack/datasets/leg_bills` |
| `leg_analysis`     | `analysisId` | Written by AIP Logic Action      |
| `leg_platform_plank` | `plankId`  | Manual dataset or seed script    |

See `ontology/object-types.js` for full property definitions.

### Action Types (Ontology Manager → Actions)
Create one Action:
- **Name:** `upsertLegAnalysis`
- **Type:** Upsert (create or update)
- **Object Type:** `leg_analysis`
- **Properties:** All fields from `LegAnalysis` object type

---

## Step 2: Pipeline Builder (Daily Ingestion)

1. Go to **Pipeline Builder** → New Transform → Python
2. Upload `functions/transforms/ohio_legislature_ingest.py`
3. Set output datasets:
   - `/ohio-legitrack/datasets/leg_bills`
   - `/ohio-legitrack/datasets/leg_bills_log`
4. Schedule via **Scheduler** → Daily trigger at 06:00 AM

---

## Step 3: AIP Logic Functions (Code Repositories)

1. Go to **Code Repositories** → New Repository → **Functions** template
2. Copy `functions/src/index.ts` into the repo's `src/index.ts`
3. Copy `functions/package.json`
4. In **Ontology Manager → Functions**, register:
   - `analyzeBillForParty` (inputs: billId: String, partyId: String)
   - `getBillsByKeyword` (inputs: keyword: String, chamber: String, page: Double)
   - `getCachedAnalysis` (inputs: billId: String, partyId: String)
5. Cut a release (`git tag v1.0.0 && git push --tags`)

### AIP Model Configuration
In your function, update the model name to match your AIP enrollment:
```typescript
model: "claude-3-5-sonnet",   // or "gpt-4o", "claude-3-haiku", etc.
```
Check available models in **Control Panel → AIP → Models**.

---

## Step 4: OSDK React Application (Developer Console)

### 4a. Create the Application
1. Go to **Developer Console** → Create client-facing application
2. Name: `Ohio Legislation Intelligence`
3. Note the **Client ID** and **Application RID**

### 4b. Configure Platform SDK Resources
In Developer Console → Platform SDK Resources:
- Add project: `/ohio-legitrack`
- Add allowed operations:
  - `ontologies:read-objects` (leg_bill, leg_analysis)
  - `functions:execute` (analyzeBillForParty, getBillsByKeyword, getCachedAnalysis)
  - `actions:apply` (upsertLegAnalysis)

### 4c. Set Environment Variables
Create `osdk-app/.env.local`:
```
VITE_FOUNDRY_URL=https://YOUR_ENROLLMENT.palantirfoundry.com
VITE_CLIENT_ID=YOUR_CLIENT_ID_FROM_DEVELOPER_CONSOLE
```

Update `osdk-app/src/lib/foundry.ts`:
```typescript
"ri.third-party-applications.main.application.YOUR_APP_RID"
```

### 4d. Install and Build
```bash
cd osdk-app
npm install
npm run build        # produces osdk-app/dist/
```

### 4e. Configure Website Hosting
In Developer Console → your app → Website Hosting:
- Upload `dist/` or connect the Code Repository
- **Content Security Policy** — add to CSP:
```
connect-src 'self' https://search-prod.lis.state.oh.us https://YOUR_ENROLLMENT.palantirfoundry.com;
font-src 'self' https://fonts.gstatic.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```

### 4f. Cut a Release and Deploy
```bash
git tag v1.0.0 && git push --tags
```
Then in Developer Console → deploy the tagged version.

---

## Step 5: Permissions

In **Control Panel → Groups**:
- `legitrack-readers`: Read access to `leg_bill`, `leg_analysis`
- `legitrack-admins`: + Write access, function execution

Assign groups to your Developer Console application.

---

## Data Flow Summary

```
Ohio Legislature API
        │  (daily, rate-limited 1 req/2s)
        ▼
Pipeline Builder Transform
        │  writes
        ▼
leg_bills dataset ──► Ontology Sync ──► leg_bill Objects
                                              │
                                   OSDK React App queries
                                              │
                                    User expands a bill
                                              │
                               OSDK calls getCachedAnalysis()
                                              │
                                    Cache miss? ──► analyzeBillForParty()
                                                           │
                                                    AIP LLM (Claude / GPT-4)
                                                           │
                                               upsertLegAnalysis Action
                                                           │
                                                  leg_analysis Objects
                                                     (cached forever)
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Ohio API calls fail with CSP error | Add `connect-src https://search-prod.lis.state.oh.us` to CSP |
| Functions not found in OSDK | Ensure functions are registered in Ontology Manager and released |
| AIP model not available | Check Control Panel → AIP → Models for your enrollment |
| `upsertLegAnalysis` action fails | Verify Action Type exists in Ontology Manager with correct properties |
| Auth redirect loops | Ensure Client ID and Application RID match Developer Console values |
