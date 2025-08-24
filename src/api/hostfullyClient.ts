// src/api/hostfullyClient.ts - Dynamic property detection version
import axios, { AxiosError, AxiosInstance } from "axios";
import { ENV } from "../utils/env";

export interface HostfullyProperty {
  uid: string;
  name?: string;
  title?: string;
  isActive?: boolean;
  maxGuests?: number;
  tags?: string[];
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
  availability?: { maxGuests?: number };
  [key: string]: any;
}

type Meta = { count?: number; totalCount?: number; nextPage?: number; nextOffset?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HostfullyClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: ENV.BASE, // e.g. https://platform.hostfully.com/api/v3.2
      timeout: 15000,
      headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    });
  }

  /* ---------------- Diagnostics ---------------- */
  async whoAmI() {
    const res = await this.http.get("/agencies");
    return res.data;
  }

  async listAgencies() {
    const res = await this.http.get("/agencies");
    return (res.data?.agencies ?? res.data?.data ?? res.data) || [];
  }

  /* ---------------- Helpers ---------------- */
  private normalize<T = any>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.properties)) return data.properties as T[];
    if (Array.isArray(data?.data)) return data.data as T[];
    return [];
  }

  private meta(data: any): Meta {
    return (data?._metadata ?? data?.meta ?? {}) as Meta;
  }

  // GET with retry/backoff for 429/5xx
  private async getWithRetry(path: string, params: Record<string, any>) {
    let attempt = 0;
    while (true) {
      try {
        return await this.http.get(path, { params });
      } catch (err) {
        const e = err as AxiosError<any>;
        const status = e.response?.status ?? 0;
        const retryable = status === 429 || (status >= 500 && status < 600);
        if (!retryable) throw err;

        const retryAfterHdr = e.response?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHdr ? Number(retryAfterHdr) * 1000 : 0;
        const step = Math.min(120_000, 15_000 * (attempt + 1));
        const wait = Math.max(step, retryAfterMs, Number(process.env.THROTTLE_MS || 1000));
        console.log(`[REST] ${status} -> waiting ${wait}ms (attempt ${attempt + 1})`);
        await sleep(wait);
        attempt++;
      }
    }
  }

  /* ---------------- Public: list all properties with dynamic discovery ---------------- */
  async listAllProperties(params: Record<string, any> = {}): Promise<HostfullyProperty[]> {
    if (!ENV.AGENCY_UID) throw new Error("AGENCY_UID missing in environment");

    // Start with a high limit and progressively test higher values
    const testLimits = [2000, 1000, 500, 300, 200];
    let bestResult: HostfullyProperty[] = [];
    let optimalLimit = 200;

    const baseParams = { agencyUid: ENV.AGENCY_UID, includeArchived: true, ...params };

    // Test different limits to find the one that returns the most properties
    for (const limit of testLimits) {
      try {
        console.log(`[REST] Testing _limit=${limit}...`);
        const testParams = { ...baseParams, _limit: limit };
        const res = await this.getWithRetry("/properties", testParams);
        const items = this.normalize<HostfullyProperty>(res.data);
        
        console.log(`[REST] _limit=${limit} -> ${items.length} properties`);
        
        if (items.length > bestResult.length) {
          bestResult = items;
          optimalLimit = limit;
          console.log(`[REST] New best: ${items.length} properties with limit ${limit}`);
        }
        
        // If we got fewer items than the limit, we've likely found all properties
        if (items.length < limit) {
          console.log(`[REST] Found all properties (${items.length} < ${limit})`);
          break;
        }
        
      } catch (e) {
        console.log(`[REST] _limit=${limit} failed, trying next...`);
        continue;
      }
    }

    // If we still hit the limit, try even higher values
    if (bestResult.length === optimalLimit) {
      console.log(`[REST] Potentially more properties available, testing higher limits...`);
      
      const higherLimits = [3000, 5000, 10000];
      for (const limit of higherLimits) {
        try {
          const testParams = { ...baseParams, _limit: limit };
          const res = await this.getWithRetry("/properties", testParams);
          const items = this.normalize<HostfullyProperty>(res.data);
          
          console.log(`[REST] _limit=${limit} -> ${items.length} properties`);
          
          if (items.length > bestResult.length) {
            bestResult = items;
            console.log(`[REST] Found ${items.length} properties with higher limit ${limit}`);
          }
          
          if (items.length < limit) {
            console.log(`[REST] Reached maximum at ${items.length} properties`);
            break;
          }
          
        } catch (e) {
          console.log(`[REST] _limit=${limit} failed`);
          break;
        }
      }
    }

    // If still not getting everything, try variants with deduplication
    if (bestResult.length > 0) {
      const seen = new Set(bestResult.map((i) => i.uid));
      const all = [...bestResult];

      const variants: Array<[string, Record<string, any>]> = [
        ["includeDeleted", { ...baseParams, _limit: optimalLimit, includeDeleted: true }],
        ["no-archived", { ...baseParams, _limit: optimalLimit, includeArchived: false }],
        ["topLevelOnly", { ...baseParams, _limit: optimalLimit, topLevelOnly: true }],
        ["includeInactive", { ...baseParams, _limit: optimalLimit, includeInactive: true }],
      ];

      for (const [label, p] of variants) {
        try {
          const r = await this.getWithRetry("/properties", p);
          const arr = this.normalize<HostfullyProperty>(r.data);
          let added = 0;
          arr.forEach((it) => {
            if (!seen.has(it.uid)) {
              seen.add(it.uid);
              all.push(it);
              added++;
            }
          });
          if (added > 0) {
            console.log(`[REST] variant ${label}: +${added}, total ${all.length}`);
          }
        } catch {
          // ignore variant failures
        }
      }
      
      bestResult = all;
    }

    console.log(`[REST] Final result: ${bestResult.length} properties`);
    return bestResult;
  }

  /* ---------------- Public: discover total count ---------------- */
  async discoverTotalCount(): Promise<{ reported: number; actual: number }> {
    try {
      // First try to get metadata
      const res = await this.getWithRetry("/properties", {
        agencyUid: ENV.AGENCY_UID,
        _limit: 1,
        includeArchived: true
      });
      
      const meta = this.meta(res.data);
      const reportedCount = meta.totalCount || meta.count || 0;
      
      // Then try to discover actual count by testing limits
      let actualCount = 0;
      const testLimits = [100, 500, 1000, 2000, 5000];
      
      for (const limit of testLimits) {
        try {
          const testRes = await this.getWithRetry("/properties", {
            agencyUid: ENV.AGENCY_UID,
            _limit: limit,
            includeArchived: true
          });
          const items = this.normalize(testRes.data);
          actualCount = Math.max(actualCount, items.length);
          
          if (items.length < limit) {
            // Found all properties
            break;
          }
        } catch (e) {
          // Continue with next limit
        }
      }
      
      console.log(`[REST] Count discovery - Reported: ${reportedCount}, Actual: ${actualCount}`);
      return { reported: reportedCount, actual: actualCount };
      
    } catch (e) {
      console.warn("[REST] Count discovery failed");
      return { reported: 0, actual: 0 };
    }
  }

  /* ---------------- Public: single property ---------------- */
  async getPropertyByUid(uid: string): Promise<HostfullyProperty | null> {
    try {
      const res = await this.getWithRetry(`/properties/${uid}`, { agencyUid: ENV.AGENCY_UID });
      const data = res.data;
      if (data?.uid) return data as HostfullyProperty;
      if (data?.property?.uid) return data.property as HostfullyProperty;
      return null;
    } catch {
      return null;
    }
  }

  /* ---------------- Convenience ---------------- */
  async getPropertiesByUids(uids: string[]): Promise<HostfullyProperty[]> {
    const out: HostfullyProperty[] = [];
    const delay = Number(process.env.THROTTLE_MS || 1000);
    for (let i = 0; i < uids.length; i++) {
      const p = await this.getPropertyByUid(uids[i]);
      if (p) out.push(p);
      if (delay && i < uids.length - 1) await sleep(delay);
    }
    return out;
  }

  async getPropertyCount(params: Record<string, any> = {}) {
    const res = await this.getWithRetry("/properties", {
      agencyUid: ENV.AGENCY_UID,
      includeArchived: false,
      _limit: 1,
      ...params,
    });
    const meta = this.meta(res.data);
    return { count: this.normalize(res.data).length, totalCount: meta.totalCount ?? meta.count };
  }
}