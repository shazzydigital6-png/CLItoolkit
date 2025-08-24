// src/api/graphqlHostfullyClient.ts
import axios, { AxiosInstance } from "axios";
import { ENV } from "../utils/env";

/** ---------- Types ---------- */
export interface GraphQLProperty {
  uid: string;
  name: string;
  isActive: boolean;
  mainPicture?: {
    tinyThumbnail?: string;
    largeThumbnail?: string;
  };
  businessType?: string;
  propertyType?: string;
  availability?: { maxGuests?: number };
  address?: {
    address?: string;
    address2?: string;
    zipCode?: string;
    city?: string;
    state?: string;
  };
  subUnits?: Array<{
    uid: string;
    isActive?: boolean;
    name?: string;
    mainPicture?: { tinyThumbnail?: string; largeThumbnail?: string };
    availability?: { maxGuests?: number };
    businessType?: string;
    propertyType?: string;
    tags?: string[];
  }>;
  numberOfSubUnits?: number;
  pricing?: { currency?: string };
  tags?: string[];
}

// Compatibility for CLI
export interface Property {
  uid: string;
  name?: string;
  title?: string;
  isActive: boolean;
  [key: string]: any;
}

/** ---------- Client ---------- */
export class GraphQLHostfullyClient {
  private http: AxiosInstance;
  private authToken: string | null;

  constructor(authToken?: string) {
    this.authToken = authToken ?? process.env.HOSTFULLY_JWT_TOKEN ?? null;

    this.http = axios.create({
      baseURL: ENV.BASE,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "X-HOSTFULLY-APIKEY": ENV.APIKEY,
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
    });

    console.log(`🔧 GraphQL Client: ${ENV.BASE}  | Agency: ${ENV.AGENCY_UID}`);
  }

  /** ---- Low-level helper ---- */
  private async executeQuery<T = any>(
    query: string,
    variables: Record<string, any> = {},
    operationName?: string
  ): Promise<T> {
    const res = await this.http.post("/graphql", { query, variables, operationName });
    if (res.data?.errors) {
      throw new Error(
        `GraphQL error: ${JSON.stringify(res.data.errors.map((e: any) => e.message))}`
      );
    }
    return res.data?.data as T;
  }

  /** ---- Public: whoAmI (sanity) ---- */
  async whoAmI() {
    // Minimal schema call that most servers support
    const data = await this.executeQuery<{ __schema: { types: { name: string }[] } }>(
      `query Introspection { __schema { types { name } } }`
    );
    return {
      ok: true,
      types: data.__schema?.types?.length ?? 0,
      agencyUid: ENV.AGENCY_UID,
    };
  }

  
  async getAllProperties(): Promise<GraphQLProperty[]> {
  const fields = `
    uid name isActive mainPicture { tinyThumbnail largeThumbnail }
    businessType propertyType availability { maxGuests }
    address { address address2 zipCode city state }
    subUnits { uid isActive name mainPicture { tinyThumbnail largeThumbnail }
      availability { maxGuests } businessType propertyType tags }
    numberOfSubUnits pricing { currency } tags
  `;

  const seen = new Set<string>();
  const all: GraphQLProperty[] = [];

  // Try different strategies with increasing limits
  const strategies = [
    { topLevelOnly: true, limit: 500 },
    { topLevelOnly: false, limit: 500 },
    { topLevelOnly: true, limit: 1000 },
    { topLevelOnly: false, limit: 1000 },
    { topLevelOnly: true, limit: 2000 },
    { topLevelOnly: false, limit: 2000 }
  ];

  for (const strategy of strategies) {
    const query = `
      query Properties($agencyUid: String!, $limit: Int, $topLevelOnly: Boolean) {
        properties(agencyUid: $agencyUid, topLevelOnly: $topLevelOnly, limit: $limit) { ${fields} }
      }`;
    
    try {
      const result = await this.executeQuery<{ properties: GraphQLProperty[] }>(query, {
        agencyUid: ENV.AGENCY_UID,
        limit: strategy.limit,
        topLevelOnly: strategy.topLevelOnly
      });
      
      let newCount = 0;
      (result.properties || []).forEach((p) => {
        if (!seen.has(p.uid)) {
          seen.add(p.uid);
          all.push(p);
          newCount++;
        }
      });
      
      console.log(`📊 GraphQL strategy (topLevel: ${strategy.topLevelOnly}, limit: ${strategy.limit}): +${newCount} new, total: ${all.length}`);
      
    } catch (e) {
      console.warn(`GraphQL strategy failed: ${e}`);
    }
  }

  console.log(`📊 GraphQL total unique properties: ${all.length}`);
  return all;
}

  /** ---- Public: single property details ---- */
  async getPropertyDetails(uid: string) {
    const q = `
      query Property($uid: String!) {
        property(uid: $uid) {
          uid
          name
          summary
          description
          isActive
          businessType
          propertyType
          availability { maxGuests }
          bathroomsNumber
          bedroomsNumber
          address {
            address address2 zipCode city state latitude longitude
          }
          pricing { currency }
          tags
          amenities { uid name category }
          photos { uid url description order }
        }
      }`;
    const data = await this.executeQuery<{ property: any }>(q, { uid }, "Property");
    return data.property;
  }

  /** ---- Public: update property ---- */
  async updateProperty(uid: string, updates: Record<string, any>): Promise<boolean> {
    const m = `
      mutation UpdateProperty($uid: String!, $input: PropertyInput!) {
        updateProperty(uid: $uid, input: $input) { uid name isActive }
      }`;
    const data = await this.executeQuery<{ updateProperty: { uid: string } | null }>(
      m,
      { uid, input: updates },
      "UpdateProperty"
    );
    return Boolean(data.updateProperty);
  }

  /** ---- Public: bulk update (throttled) ---- */
  async bulkUpdateProperties(
    updates: Array<{ uid: string; data: Record<string, any> }>
  ): Promise<{ successful: number; failed: number }> {
    let successful = 0,
      failed = 0;
    const delay = Number(process.env.THROTTLE_MS || 1000);

    for (let i = 0; i < updates.length; i++) {
      const { uid, data } = updates[i];
      try {
        const ok = await this.updateProperty(uid, data);
        ok ? successful++ : failed++;
      } catch {
        failed++;
      }
      if (delay && i < updates.length - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return { successful, failed };
  }

  /** ---- Diagnostics ---- */
  async testAccess(): Promise<boolean> {
    try {
      const props = await this.getAllProperties();
      console.log(`✅ GraphQL access OK: ${props.length} properties`);
      return true;
    } catch (e) {
      console.error("❌ GraphQL test failed:", (e as any)?.message);
      return false;
    }
  }

  /** ---- CLI compatibility ---- */
  async listAllProperties(): Promise<Property[]> {
    const props = await this.getAllProperties();
    return props.map((p) => ({
      uid: p.uid,
      name: p.name,
      title: p.name,
      isActive: p.isActive,
      ...p,
    }));
  }
}