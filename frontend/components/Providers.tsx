"use client";

import { SWRConfig } from "swr";
import { API_URL } from "@/lib/api";

// One shared fetcher + poll config for the whole app. Because this provider
// lives in the root layout, the SWR cache survives route navigation: every
// page reads the same "/api/state" key, so switching routes is instant and
// the 3s poll continues uninterrupted.
const fetcher = async (key: string | [string, ...unknown[]]) => {
  const path = Array.isArray(key) ? key[0] : key;
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        refreshInterval: 3000,
        dedupingInterval: 2500,
        keepPreviousData: true,
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
