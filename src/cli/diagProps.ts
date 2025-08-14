// src/cli/diagProps.ts
import axios from "axios";
import { ENV } from "../utils/env";
import { HostfullyClient } from "../api/hostfullyClient";

async function fetch(style: string, value: number, limit = 20) {
  const base = axios.create({
    baseURL: ENV.BASE,
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    timeout: 15000,
  });

  const params: Record<string, any> = { agencyUid: ENV.AGENCY_UID, limit };

  switch (style) {
    case "page":   params.page = value; break;
    case "offset": params.offset = value; break;
    case "start":  params.start = value; break;
    case "skip":   params.skip = value; break;
    case "cursor": params.cursor = value; break;
  }

  const res = await base.get("/properties", { params });
  const data = res.data;
  const arr = Array.isArray(data?.properties) ? data.properties
            : Array.isArray(data?.data)       ? data.data
            : Array.isArray(data)             ? data
            : [];
  const uids = arr.map((p: any) => p.uid);
  const meta = data?._metadata ?? data?.meta ?? null;
  const paging = data?._paging ?? null;
  
  return { uids, meta, paging, headers: res.headers, rawData: data };
}

export async function runDiagProps(limit = 20) {
  console.log(`\n[diag-props] BASE=${ENV.BASE}`);
  console.log(`[diag-props] agency=${ENV.AGENCY_UID} limit=${limit}\n`);

  // First, get the total count
  console.log("=== STEP 1: Getting total count ===");
  try {
    const client = new HostfullyClient();
    const countInfo = await client.getPropertyCount();
    console.log(`API reports: ${JSON.stringify(countInfo)}`);
    
    if (countInfo.totalCount) {
      const expectedPages = Math.ceil(countInfo.totalCount / limit);
      console.log(`Expected pages needed: ${expectedPages} (${countInfo.totalCount} properties ÷ ${limit} per page)`);
    }
  } catch (e: any) {
    console.error("Failed to get count:", e?.response?.data || e?.message);
  }

  console.log("\n=== STEP 2: Testing pagination styles ===");
  
  // Test various pagination approaches
  const styles = [
    { name: "base (no pagination)", s: "page", v: 1 },
    { name: "page=1", s: "page", v: 1 },
    { name: "page=2", s: "page", v: 2 },
    { name: "page=3", s: "page", v: 3 },
    { name: "page=4", s: "page", v: 4 },
    { name: "page=5", s: "page", v: 5 },
    { name: "offset=0", s: "offset", v: 0 },
    { name: "offset=20", s: "offset", v: 20 },
    { name: "offset=40", s: "offset", v: 40 },
    { name: "offset=60", s: "offset", v: 60 },
    { name: "offset=80", s: "offset", v: 80 },
  ] as const;

  let firstCursor: string | null = null;

  for (const t of styles) {
    try {
      const { uids, meta, paging } = await fetch(t.s, t.v, limit);
      console.log(`${t.name.padEnd(20)} -> count=${uids.length.toString().padStart(2)}  first3=[${uids.slice(0,3).join(",")}]`);
      
      if (meta && (meta.totalCount || meta.count)) {
        console.log(`${" ".repeat(20)}    meta: totalCount=${meta.totalCount}, count=${meta.count}`);
      }
      
      if (paging) {
        console.log(`${" ".repeat(20)}    paging:`, paging);
        if (paging._nextCursor && !firstCursor) {
          firstCursor = paging._nextCursor;
        }
      }
    } catch (e: any) {
      console.log(`${t.name.padEnd(20)} -> ERROR ${e?.response?.status || ""}`, e?.response?.data || e?.message);
    }
  }

  // Test cursor pagination if we found one
  if (firstCursor) {
    console.log("\n=== STEP 3: Testing cursor pagination ===");
    try {
      const { uids, meta, paging } = await fetch("cursor", firstCursor as any, limit);
      console.log(`cursor test          -> count=${uids.length.toString().padStart(2)}  first3=[${uids.slice(0,3).join(",")}]`);
      
      if (paging?._nextCursor) {
        console.log(`${" ".repeat(20)}    next cursor available: ${String(paging._nextCursor).slice(0,20)}...`);
      }
    } catch (e: any) {
      console.log(`cursor test          -> ERROR ${e?.response?.status || ""}`, e?.response?.data || e?.message);
    }
  }

  console.log("\n=== STEP 4: Full pagination test ===");
  console.log("Running enhanced client to see what it finds...");
  process.env.DEBUG = "true";
  
  try {
    const client = new HostfullyClient();
    const allProps = await client.listAllProperties();
    console.log(`\n✅ Enhanced client result: ${allProps.length} properties retrieved`);
    
    // Show some sample UIDs to verify uniqueness
    const uids = allProps.map(p => p.uid);
    const uniqueUids = new Set(uids);
    console.log(`   Unique UIDs: ${uniqueUids.size}/${uids.length} (${uniqueUids.size === uids.length ? 'all unique ✅' : 'duplicates found ⚠️'})`);
    
    if (allProps.length > 0) {
      console.log(`   Sample properties:`, allProps.slice(0, 3).map(p => ({ uid: p.uid, name: p.name || p.title })));
    }
  } catch (e: any) {
    console.error("Enhanced client failed:", e?.response?.data || e?.message);
  }

  console.log("");
}