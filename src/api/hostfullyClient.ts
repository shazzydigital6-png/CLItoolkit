// src/api/hostfullyClient.ts - OPTIMIZED VERSION
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

  // Raw descriptions from API (added by parsePropertyDescriptions)
  rawDescriptions?: any[];

  // Individual description fields (added by parsePropertyDescriptions function)
  description_name?: string;
  description_locale?: string;
  description_shortSummary?: string;
  description_longDescription?: string;
  description_notes?: string;
  description_interaction?: string;
  description_neighbourhood?: string;
  description_space?: string;
  description_access?: string;
  description_transit?: string;
  description_houseManual?: string;

  // Main description fields (convenience aliases)
  main_description_name?: string;
  main_description_shortSummary?: string;
  main_description_longDescription?: string;
  main_description_notes?: string;
  main_description_interaction?: string;
  main_description_neighbourhood?: string;
  main_description_space?: string;
  main_description_access?: string;
  main_description_transit?: string;
  main_description_houseManual?: string;
  main_description_locale?: string;

  // Character count fields (added by parsePropertyDescriptions)
  description_name_length?: number;
  description_shortSummary_length?: number;
  description_longDescription_length?: number;
  description_notes_length?: number;
  description_interaction_length?: number;
  description_neighbourhood_length?: number;
  description_space_length?: number;
  description_access_length?: number;
  description_transit_length?: number;
  description_houseManual_length?: number;

  // Allow any additional fields that might be added dynamically
  [key: string]: any;
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
   * OPTIMIZED: Get all properties efficiently using the known working approach
   */
  async listAllProperties(params: Record<string, any> = {}): Promise<HostfullyProperty[]> {
    if (!ENV.AGENCY_UID) throw new Error("AGENCY_UID missing in .env");
    
    console.log("[hostfully] Using optimized strategy: _limit=200...");
    
    try {
      // Strategy 1: Direct approach with _limit=200 (known to work from original code)
      const res = await this.getWithRetry("/properties", {
        agencyUid: ENV.AGENCY_UID,
        _limit: 200,
        includeArchived: true,
        ...params
      });
      
      const properties = this.normalize<HostfullyProperty>(res.data);
      console.log(`[hostfully] Found ${properties.length} properties with _limit=200`);
      
      if (properties.length >= 80) {
        console.log(`[hostfully] Success! Found expected number of properties`);
        return properties;
      }
      
      // If we didn't get enough, try a few more optimized strategies
      console.log(`[hostfully] Only found ${properties.length} properties, trying additional strategies...`);
      
      const allProperties: HostfullyProperty[] = [...properties];
      const seen = new Set<string>(properties.map(p => p.uid));
      
      // Strategy 2: Try with different status filters
      const additionalStrategies = [
        { name: "includeDeleted", params: { agencyUid: ENV.AGENCY_UID, _limit: 200, includeDeleted: true } },
        { name: "all-statuses", params: { agencyUid: ENV.AGENCY_UID, _limit: 200, includeArchived: true, includeDeleted: true } },
        { name: "no-agency-filter", params: { _limit: 200 } }
      ];
      
      for (const strategy of additionalStrategies) {
        try {
          console.log(`[hostfully] Trying ${strategy.name}...`);
          const res = await this.getWithRetry("/properties", strategy.params);
          const items = this.normalize<HostfullyProperty>(res.data);
          
          let added = 0;
          items.forEach(item => {
            // Filter for your agency if we removed the agency filter
            const isYourAgency = strategy.name === 'no-agency-filter' 
              ? (item.agencyUid === ENV.AGENCY_UID || (item as any).agency?.uid === ENV.AGENCY_UID)
              : true;
              
            if (isYourAgency && !seen.has(item.uid)) {
              seen.add(item.uid);
              allProperties.push(item);
              added++;
            }
          });
          
          console.log(`[hostfully] ${strategy.name}: +${added} new properties (total: ${allProperties.length})`);
          
          if (allProperties.length >= 85) {
            console.log(`[hostfully] Found sufficient properties, stopping`);
            break;
          }
          
        } catch (error) {
          console.log(`[hostfully] ${strategy.name} failed, continuing...`);
        }
      }
      
      console.log(`[hostfully] Optimized search complete: Found ${allProperties.length} total properties`);
      return allProperties;
      
    } catch (error) {
      console.error("[hostfully] Optimized strategy failed, falling back to full workaround...");
      return this.listAllPropertiesWorkaround(params);
    }
  }

  /**
   * FALLBACK: Full workaround method (only used if optimized approach fails)
   */
  private async listAllPropertiesWorkaround(params: Record<string, any> = {}): Promise<HostfullyProperty[]> {
    const DEBUG = process.env.DEBUG === "true";
    const THROTTLE_MS = Number(process.env.THROTTLE_MS || 1000);
    const all: HostfullyProperty[] = [];
    const seen = new Set<string>();
    
    const baseParams = {
      agencyUid: ENV.AGENCY_UID,
      includeArchived: params.includeArchived ?? false,
      ...params,
    };

    console.log("[hostfully] Starting comprehensive workaround strategies...");

    // Try different limits using _limit parameter
    const limits = [200, 100, 50, 30, 25, 20, 15, 10, 5, 1]; // Start with highest first
    for (const limit of limits) {
      if (DEBUG) console.log(`[hostfully] Trying _limit=${limit}...`);
      
      try {
        const res = await this.getWithRetry("/properties", { ...baseParams, _limit: limit });
        const items = this.normalize<HostfullyProperty>(res.data);
        
        let added = 0;
        for (const item of items) {
          if (!seen.has(item.uid)) {
            seen.add(item.uid);
            all.push(item);
            added++;
          }
        }
        
        if (DEBUG) console.log(`[hostfully] _limit=${limit} -> ${items.length} items, ${added} new, total=${all.length}`);
        
        // If we found a good amount, don't bother with smaller limits
        if (limit >= 50 && items.length >= 50) {
          console.log(`[hostfully] Found substantial results with _limit=${limit}, skipping smaller limits`);
          break;
        }
        
        if (THROTTLE_MS) await sleep(THROTTLE_MS);
        
      } catch (e: any) {
        if (DEBUG) console.log(`[hostfully] _limit=${limit} failed:`, e?.response?.status);
      }
    }

    // Try includeArchived variations (only if we don't have enough)
    if (all.length < 80) {
      for (const archived of [true, false]) {
        if (DEBUG) console.log(`[hostfully] Trying includeArchived=${archived}...`);
        
        try {
          const res = await this.getWithRetry("/properties", { 
            ...baseParams, 
            includeArchived: archived,
            _limit: 200 
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
    }

    console.log(`[hostfully] Workaround complete: Found ${all.length} unique properties`);
    
    if (all.length < 89) {
      console.warn(`[hostfully] Still missing properties (${all.length}/89 found)`);
      console.warn(`[hostfully] This appears to be a Hostfully API pagination issue.`);
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
      _limit: 1, // Just get metadata
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