// src/cli/investigate.ts
import axios from "axios";
import { ENV } from "../utils/env";

async function investigateAPI() {
  console.log(`\n🔍 HOSTFULLY API INVESTIGATION`);
  console.log(`=====================================`);
  console.log(`BASE: ${ENV.BASE}`);
  console.log(`AGENCY: ${ENV.AGENCY_UID}\n`);

  const base = axios.create({
    baseURL: ENV.BASE,
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    timeout: 15000,
  });

  // 1. Check what endpoints are available
  console.log("1️⃣ TESTING AVAILABLE ENDPOINTS");
  console.log("─".repeat(40));
  
  const endpoints = [
    "/properties",
    "/listings", 
    "/units",
    "/rentals",
    "/properties/search",
    "/agencies",
    "/properties/active",
    "/properties/inactive"
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await base.get(endpoint, { 
        params: { agencyUid: ENV.AGENCY_UID, limit: 1 },
        validateStatus: () => true // Don't throw on 404
      });
      
      if (res.status === 200) {
        const data = res.data;
        const count = Array.isArray(data?.properties) ? data.properties.length
                    : Array.isArray(data?.data) ? data.data.length
                    : Array.isArray(data) ? data.length : 0;
        console.log(`✅ ${endpoint} -> ${res.status} (${count} items)`);
        
        // Check for helpful metadata
        if (data._metadata || data.meta) {
          const meta = data._metadata || data.meta;
          console.log(`   📊 Meta: ${JSON.stringify(meta)}`);
        }
      } else {
        console.log(`❌ ${endpoint} -> ${res.status}`);
      }
    } catch (e: any) {
      console.log(`❌ ${endpoint} -> ERROR ${e?.response?.status || e.message}`);
    }
  }

  // 2. Test API versioning
  console.log(`\n2️⃣ TESTING API VERSIONS`);
  console.log("─".repeat(40));
  
  const versions = ["v3.0", "v3.1", "v3.2", "v4.0"];
  for (const version of versions) {
    try {
      const versionedBase = axios.create({
        baseURL: ENV.BASE.replace(/v\d+\.\d+/, version),
        headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
        timeout: 15000,
      });
      
      const res = await versionedBase.get("/properties", { 
        params: { agencyUid: ENV.AGENCY_UID, limit: 5 },
        validateStatus: () => true
      });
      
      if (res.status === 200) {
        const data = res.data;
        const items = Array.isArray(data?.properties) ? data.properties
                    : Array.isArray(data?.data) ? data.data
                    : Array.isArray(data) ? data : [];
        console.log(`✅ ${version} -> ${items.length} properties`);
        
        if (items.length > 0) {
          console.log(`   First UID: ${items[0]?.uid}`);
        }
      } else {
        console.log(`❌ ${version} -> ${res.status}`);
      }
    } catch (e: any) {
      console.log(`❌ ${version} -> ERROR`);
    }
  }

  // 3. Test different authentication methods
  console.log(`\n3️⃣ TESTING AGENCY DISCOVERY`);
  console.log("─".repeat(40));
  
  try {
    const agencyRes = await base.get("/agencies");
    console.log("📋 Available agencies:");
    
    const agencies = agencyRes.data?.agencies || agencyRes.data?.data || agencyRes.data || [];
    if (Array.isArray(agencies)) {
      agencies.forEach((agency: any, i: number) => {
        console.log(`   ${i+1}. ${agency.name || agency.displayName || 'Unnamed'} (${agency.uid})`);
        if (agency.uid === ENV.AGENCY_UID) {
          console.log(`      👆 THIS IS YOUR AGENCY`);
        }
      });
    } else {
      console.log("   ⚠️ Unexpected response format:", typeof agencies);
    }
  } catch (e: any) {
    console.log(`❌ /agencies failed: ${e?.response?.status}`);
  }

  // 4. Test property status filtering
  console.log(`\n4️⃣ TESTING PROPERTY FILTERS`);
  console.log("─".repeat(40));
  
  const filters = [
    { name: "active only", params: { status: "active" } },
    { name: "inactive only", params: { status: "inactive" } },
    { name: "all statuses", params: { includeArchived: true } },
    { name: "published only", params: { published: true } },
    { name: "unpublished only", params: { published: false } },
    { name: "no agency filter", params: { limit: 20 } }, // Remove agencyUid
  ];

  for (const filter of filters) {
    try {
      const params = filter.name === "no agency filter" 
        ? filter.params 
        : { agencyUid: ENV.AGENCY_UID, ...filter.params };
        
      const res = await base.get("/properties", { params });
      const data = res.data;
      const items = Array.isArray(data?.properties) ? data.properties
                  : Array.isArray(data?.data) ? data.data
                  : Array.isArray(data) ? data : [];
      
      console.log(`🔍 ${filter.name.padEnd(20)} -> ${items.length} properties`);
      
      if (items.length > 0) {
        console.log(`   First UID: ${items[0]?.uid}`);
        console.log(`   Sample names: ${items.slice(0,3).map((p: any) => p.name || p.title).join(", ")}`);
      }
      
      // Look for different UIDs than our stuck set
      const firstUID = items[0]?.uid;
      if (firstUID && firstUID !== "ac8d730c-2554-4547-986a-dda3bb2a6b62") {
        console.log(`   🎉 DIFFERENT UIDS FOUND! This filter works differently.`);
      }
      
    } catch (e: any) {
      console.log(`❌ ${filter.name} -> ERROR ${e?.response?.status}`);
    }
  }

  // 5. Test raw requests without our wrapper
  console.log(`\n5️⃣ TESTING RAW PAGINATION`);
  console.log("─".repeat(40));
  
  try {
    console.log("Testing cursor from first response...");
    const firstRes = await base.get("/properties", { 
      params: { agencyUid: ENV.AGENCY_UID, limit: 10 }
    });
    
    const cursor = firstRes.data?._paging?._nextCursor;
    if (cursor) {
      console.log(`📎 Found cursor: ${cursor}`);
      
      // Try cursor WITHOUT agencyUid (sometimes this is the issue)
      const cursorRes = await base.get("/properties", {
        params: { cursor, limit: 10 }
      });
      
      const cursorItems = Array.isArray(cursorRes.data?.properties) ? cursorRes.data.properties
                        : Array.isArray(cursorRes.data?.data) ? cursorRes.data.data
                        : Array.isArray(cursorRes.data) ? cursorRes.data : [];
      
      console.log(`🔗 Cursor (no agency) -> ${cursorItems.length} properties`);
      if (cursorItems.length > 0) {
        console.log(`   First UID: ${cursorItems[0]?.uid}`);
        if (cursorItems[0]?.uid !== firstRes.data.properties[0]?.uid) {
          console.log(`   🎉 CURSOR RETURNED DIFFERENT DATA!`);
        }
      }
      
      // Try cursor WITH agencyUid
      const cursorRes2 = await base.get("/properties", {
        params: { cursor, agencyUid: ENV.AGENCY_UID, limit: 10 }
      });
      
      const cursorItems2 = Array.isArray(cursorRes2.data?.properties) ? cursorRes2.data.properties
                         : Array.isArray(cursorRes2.data?.data) ? cursorRes2.data.data
                         : Array.isArray(cursorRes2.data) ? cursorRes2.data : [];
      
      console.log(`🔗 Cursor (with agency) -> ${cursorItems2.length} properties`);
      if (cursorItems2.length > 0) {
        console.log(`   First UID: ${cursorItems2[0]?.uid}`);
      }
    } else {
      console.log("❌ No cursor found in response");
    }
  } catch (e: any) {
    console.log(`❌ Cursor test failed: ${e?.response?.status}`);
  }

  console.log(`\n✅ INVESTIGATION COMPLETE`);
  console.log(`=====================================`);
  console.log(`💡 Next steps:`);
  console.log(`   1. Look for endpoints/filters that return different UIDs`);
  console.log(`   2. Try the workaround client with multiple strategies`);
  console.log(`   3. Contact Hostfully support with these findings`);
}

export { investigateAPI };