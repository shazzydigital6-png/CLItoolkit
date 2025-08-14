// src/api/hostfullyClient.ts - WORKAROUND VERSION
import axios, { AxiosError } from "axios";
import { ENV } from "../utils/env";

export interface HostfullyProperty {
  uid: string;
  // Common fields we read later
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  isActive?: boolean;

  bedrooms?: number;
  bathrooms?: number | string; // sometimes string in API
  maxGuests?: number;

  amenities?: string[];
  tags?: string[];
  photos?: any[];

  address?: {
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
  };

  location?: { lat?: number; lng?: number };

  availability?: {
    maxGuests?: number;
  };
}

type Meta = { count?: number; totalCount?: number; nextPage?: number; nextOffset?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HostfullyClient {
  private http = axios.create({
    baseURL: ENV.BASE, // e.g. https://platform.hostfully.com/api/v3.2
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    timeout: 15000,
  });

  // --- Diagnostics ----------------------------------------------------------
  async whoAmI() {
    const res = await this.http.get("/agencies"); // v3 uses plural
    return res.data;
  }

  async listAgencies() {
    const res = await this.http.get("/agencies");
    return (res.data?.agencies ?? res.data?.data ?? res.data) || [];
  }

  // --- Helpers --------------------------------------------------------------
  private normalize<T = any>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.properties)) return data.properties as T[]; // common v3 shape
    if (Array.isArray(data?.data)) return data.data as T[];
    return [];
  }

  private meta(data: any): Meta {
    return (data?._metadata ?? data?.meta ?? {}) as Meta;
  }

  // GET with retry/backoff for 429/5xx; first attempt is unthrottled
  private async getWithRetry(path: string, params: Record<string, any>) {
    let attempt = 0;
    while (true) {
      try {
        const throttle = Number(process.env.THROTTLE_MS || 1000); // Default 1s throttle
        if (throttle && attempt > 0) await sleep(throttle);
        return await this.http.get(path, { params });
      } catch (err) {
        const e = err as AxiosError<any>;
        const status = e.response?.status ?? 0;
        const retryable = status === 429 || (status >= 500 && status < 600);
        if (!retryable) throw err;

        const retryAfterHdr = e.response?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHdr ? Number(retryAfterHdr) * 1000 : 0;
        // Progressive backoff: 15s, 30s, 45s, 60s (cap 120s)
        const step = Math.min(120_000, 15_000 * (attempt + 1));
        const wait = Math.max(step, retryAfterMs, Number(process.env.THROTTLE_MS || 1000));

        console.log(`[hostfully] ${status} -> waiting ${wait}ms (attempt ${attempt + 1})`);
        await sleep(wait);
        attempt++;
      }
    }
  }

  /**
   * WORKAROUND: Try multiple API strategies to get all properties
   * The Hostfully API seems to have pagination bugs, so we'll try:
   * 1. Different API endpoints
   * 2. Different parameter combinations
   * 3. Various query filters
   * 4. Time-based queries if available
   */
  async listAllProperties(params: Record<string, any> = {}): Promise<HostfullyProperty[]> {
    if (!ENV.AGENCY_UID) throw new Error("AGENCY_UID missing in .env");
    
    const DEBUG = process.env.DEBUG === "true";
    const THROTTLE_MS = Number(process.env.THROTTLE_MS || 1000);
    const all: HostfullyProperty[] = [];
    const seen = new Set<string>();
    
    const baseParams = {
      agencyUid: ENV.AGENCY_UID,
      includeArchived: params.includeArchived ?? false,
      ...params,
    };

    console.log("[hostfully] Starting workaround strategies to get all properties...");

    // Strategy 1: Try different limits (sometimes different limits return different data)
    const limits = [1, 5, 10, 15, 20, 25, 30, 50];
    for (const limit of limits) {
      if (DEBUG) console.log(`[hostfully] Trying limit=${limit}...`);
      
      try {
        const res = await this.getWithRetry("/properties", { ...baseParams, limit });
        const items = this.normalize<HostfullyProperty>(res.data);
        
        let added = 0;
        for (const item of items) {
          if (!seen.has(item.uid)) {
            seen.add(item.uid);
            all.push(item);
            added++;
          }
        }
        
        if (DEBUG) console.log(`[hostfully] limit=${limit} -> ${items.length} items, ${added} new, total=${all.length}`);
        if (THROTTLE_MS) await sleep(THROTTLE_MS);
        
      } catch (e: any) {
        if (DEBUG) console.log(`[hostfully] limit=${limit} failed:`, e?.response?.status);
      }
    }

    // Strategy 2: Try includeArchived variations
    for (const archived of [true, false]) {
      if (DEBUG) console.log(`[hostfully] Trying includeArchived=${archived}...`);
      
      try {
        const res = await this.getWithRetry("/properties", { 
          ...baseParams, 
          includeArchived: archived,
          limit: 20 
        });
        const items = this.normalize<HostfullyProperty>(res.data);
        
        let added = 0;
        for (const item of items) {
          if (!seen.has(item.uid)) {
            seen.add(item.uid);
            all.push(item);
            added++;
          }
        }
        
        if (DEBUG) console.log(`[hostfully] archived=${archived} -> ${items.length} items, ${added} new, total=${all.length}`);
        if (THROTTLE_MS) await sleep(THROTTLE_MS);
        
      } catch (e: any) {
        if (DEBUG) console.log(`[hostfully] archived=${archived} failed:`, e?.response?.status);
      }
    }

    // Strategy 3: Try different API endpoints (sometimes /properties vs /listings behave differently)
    const endpoints = ["/properties", "/listings"];
    for (const endpoint of endpoints) {
      if (DEBUG) console.log(`[hostfully] Trying endpoint=${endpoint}...`);
      
      try {
        const res = await this.getWithRetry(endpoint, { ...baseParams, limit: 20 });
        const items = this.normalize<HostfullyProperty>(res.data);
        
        let added = 0;
        for (const item of items) {
          if (!seen.has(item.uid)) {
            seen.add(item.uid);
            all.push(item);
            added++;
          }
        }
        
        if (DEBUG) console.log(`[hostfully] ${endpoint} -> ${items.length} items, ${added} new, total=${all.length}`);
        if (THROTTLE_MS) await sleep(THROTTLE_MS);
        
      } catch (e: any) {
        if (DEBUG) console.log(`[hostfully] ${endpoint} failed:`, e?.response?.status);
      }
    }

    // Strategy 4: Try without agencyUid (sometimes this returns different results)
    if (DEBUG) console.log(`[hostfully] Trying without agencyUid...`);
    try {
      const { agencyUid, ...paramsWithoutAgency } = baseParams;
      const res = await this.getWithRetry("/properties", { ...paramsWithoutAgency, limit: 20 });
      const items = this.normalize<HostfullyProperty>(res.data);
      
      let added = 0;
      for (const item of items) {
        if (!seen.has(item.uid)) {
          seen.add(item.uid);
          all.push(item);
          added++;
        }
      }
      
      if (DEBUG) console.log(`[hostfully] no-agency -> ${items.length} items, ${added} new, total=${all.length}`);
      if (THROTTLE_MS) await sleep(THROTTLE_MS);
      
    } catch (e: any) {
      if (DEBUG) console.log(`[hostfully] no-agency failed:`, e?.response?.status);
    }

    // Strategy 5: Try different sorting/filtering parameters
    const sortOptions = [
      { sort: "name" },
      { sort: "created" },
      { sort: "updated" },
      { orderBy: "name" },
      { orderBy: "createdAt" },
      { orderBy: "updatedAt" },
    ];

    for (const sortOpt of sortOptions) {
      if (DEBUG) console.log(`[hostfully] Trying sort=${JSON.stringify(sortOpt)}...`);
      
      try {
        const res = await this.getWithRetry("/properties", { 
          ...baseParams, 
          ...sortOpt,
          limit: 20 
        });
        const items = this.normalize<HostfullyProperty>(res.data);
        
        let added = 0;
        for (const item of items) {
          if (!seen.has(item.uid)) {
            seen.add(item.uid);
            all.push(item);
            added++;
          }
        }
        
        if (DEBUG) console.log(`[hostfully] ${JSON.stringify(sortOpt)} -> ${items.length} items, ${added} new, total=${all.length}`);
        if (THROTTLE_MS) await sleep(THROTTLE_MS);
        
      } catch (e: any) {
        if (DEBUG) console.log(`[hostfully] ${JSON.stringify(sortOpt)} failed:`, e?.response?.status);
      }
    }

    // Strategy 6: Try fetching individual properties if we know some UIDs
    // This won't help discover new UIDs, but can validate the approach
    
    console.log(`[hostfully] Workaround complete: Found ${all.length} unique properties`);
    
    if (all.length < 89) {
      console.warn(`[hostfully] ⚠️  Still missing properties (${all.length}/89 found)`);
      console.warn(`[hostfully] This appears to be a Hostfully API pagination bug.`);
      console.warn(`[hostfully] Recommendations:`);
      console.warn(`[hostfully] 1. Contact Hostfully support about pagination issues`);
      console.warn(`[hostfully] 2. Try a different API version (v3.1, v4.0 if available)`);
      console.warn(`[hostfully] 3. Use their web interface to export all properties`);
      console.warn(`[hostfully] 4. Check if there are property status filters affecting results`);
    }

    return all;
  }

  // Helper method to get property by individual UID
  async getPropertyByUid(uid: string): Promise<HostfullyProperty | null> {
    try {
      const res = await this.getWithRetry(`/properties/${uid}`, { agencyUid: ENV.AGENCY_UID });
      const data = res.data;
      
      // Property detail endpoints sometimes return the object directly
      if (data.uid) return data as HostfullyProperty;
      if (data.property?.uid) return data.property as HostfullyProperty;
      
      return null;
    } catch (e: any) {
      if (process.env.DEBUG === "true") {
        console.log(`[hostfully] Failed to get property ${uid}:`, e?.response?.status);
      }
      return null;
    }
  }

  // Try to get properties by batch UIDs (if you have a list of known UIDs)
  async getPropertiesByUids(uids: string[]): Promise<HostfullyProperty[]> {
    const results: HostfullyProperty[] = [];
    const THROTTLE_MS = Number(process.env.THROTTLE_MS || 1000);
    
    console.log(`[hostfully] Fetching ${uids.length} properties individually...`);
    
    for (let i = 0; i < uids.length; i++) {
      const uid = uids[i];
      const property = await this.getPropertyByUid(uid);
      
      if (property) {
        results.push(property);
        if (process.env.DEBUG === "true") {
          console.log(`[hostfully] ${i+1}/${uids.length}: Got ${uid} (${property.name})`);
        }
      }
      
      if (THROTTLE_MS && i < uids.length - 1) {
        await sleep(THROTTLE_MS);
      }
    }
    
    console.log(`[hostfully] Individual fetch complete: ${results.length}/${uids.length} properties retrieved`);
    return results;
  }

  // New method: Get a quick count to verify total available
  async getPropertyCount(params: Record<string, any> = {}): Promise<{ count: number, totalCount?: number }> {
    if (!ENV.AGENCY_UID) throw new Error("AGENCY_UID missing in .env");
    
    const res = await this.getWithRetry("/properties", {
      agencyUid: ENV.AGENCY_UID,
      includeArchived: false,
      limit: 1, // Just get metadata
      ...params,
    });
    
    const data = res.data;
    const items = this.normalize(data);
    const meta = this.meta(data);
    
    return {
      count: items.length,
      totalCount: meta.totalCount || meta.count
    };
  }
}