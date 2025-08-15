// src/api/hostfullyClient.ts
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

  /* ---------------- Public: list all properties ---------------- */
  async listAllProperties(params: Record<string, any> = {}): Promise<HostfullyProperty[]> {
    if (!ENV.AGENCY_UID) throw new Error("AGENCY_UID missing in environment");

    // Try the commonly-working high limit first
    const baseParams = { agencyUid: ENV.AGENCY_UID, _limit: 200, includeArchived: true, ...params };

    try {
      const res = await this.getWithRetry("/properties", baseParams);
      const items = this.normalize<HostfullyProperty>(res.data);
      console.log(`[REST] _limit=200 -> ${items.length} properties`);
      if (items.length >= 80) return items;

      // If that didn’t return everything, try a couple of variants and merge
      const seen = new Set(items.map((i) => i.uid));
      const all = [...items];

      const variants: Array<[string, Record<string, any>]> = [
        ["includeDeleted", { ...baseParams, includeDeleted: true }],
        ["no-archived", { ...baseParams, includeArchived: false }],
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
          console.log(`[REST] variant ${label}: +${added}, total ${all.length}`);
        } catch {
          // ignore
        }
      }
      return all;
    } catch (e) {
      console.error("❌ listAllProperties failed:", (e as any)?.message);
      throw e;
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
