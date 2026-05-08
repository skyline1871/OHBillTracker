/**
 * osdk-app/src/App.tsx
 *
 * Root component. Wraps the app in Foundry's OsdkProvider (handles auth).
 * Flow: Foundry SSO → PartySelect → Tracker
 */

import { useState } from "react";
import { OsdkProvider } from "@osdk/react";
import { client } from "./lib/foundry";
import PartySelect from "./components/PartySelect";
import Tracker from "./components/Tracker";
import "./index.css";

export default function App() {
  const [partyId, setPartyId] = useState<string | null>(null);

  return (
    // OsdkProvider handles Foundry Multipass OAuth automatically.
    // If the user isn't logged in, it redirects to Multipass and back.
    <OsdkProvider client={client}>
      {partyId ? (
        <Tracker partyId={partyId} onBack={() => setPartyId(null)} />
      ) : (
        <PartySelect onSelect={setPartyId} />
      )}
    </OsdkProvider>
  );
}
