// src/cli/propertyDiscovery.ts
import axios from "axios";
import { ENV } from "../utils/env";
import { HostfullyClient, HostfullyProperty } from "../api/hostfullyClient";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function discoverAllProperties() {
  console.log("🔍 ADVANCED PROPERTY DISCOVERY");
  console.log("=====================================");
  console.log("Goal: Find all 87 properties from Hostfully API\n");

  const base = axios.create({
    baseURL: ENV.BASE,
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    timeout: 15000,
  });

  const allProperties = new Map<string, any>();
  const THROTTLE = 1000;

  // Strategy 1: Try different agency contexts
  console.log("1️⃣ TESTING AGENCY CONTEXTS");
  console.log("─".repeat(40));
  
  try {
    const agencyRes = await base.get("/agencies");
    const agencies = agencyRes.data?.agencies || agencyRes.data?.data || agencyRes.data || [];
    
    for (const agency of agencies) {
      console.log(`Testing agency: ${agency.name} (${agency.uid})`);
      
      try {
        const res = await base.get("/properties", {
          params: { agencyUid: agency.uid, limit: 50 }
        });
        
        const properties = res.data?.properties || res.data?.data || [];
        let newCount = 0;
        
        for (const prop of properties) {
          if (!allProperties.has(prop.uid)) {
            allProperties.set(prop.uid, prop);
            newCount++;
          }
        }
        
        console.log(`  Found ${properties.length} properties, ${newCount} new`);
        
      } catch (e: any) {
        console.log(`  Error: ${e?.response?.status}`);
      }
      
      await sleep(THROTTLE);
    }
  } catch (e: any) {
    console.log("Could not get agencies list");
  }

  // Strategy 2: Search by property name patterns
  console.log("\n2️⃣ TESTING SEARCH PATTERNS");
  console.log("─".repeat(40));
  
  // Based on the portal screenshot, properties follow pattern "4417-XX"
  const searchPatterns = [
    "4417",      // Base pattern
    "4417-",     // With dash
    "Swiss",     // From "Swiss Avenue"
    "Dallas",    // Location
    "Grant",     // Property names
    "Austin",
    "Oak",
    "Blue",
    "Jefferson",
    "Roosevelt",
  ];

  for (const pattern of searchPatterns) {
    console.log(`Searching for: "${pattern}"`);
    
    const searchEndpoints = [
      `/properties/search?q=${pattern}`,
      `/properties?search=${pattern}`,
      `/properties?name=${pattern}`,
      `/properties?query=${pattern}`,
      `/properties?filter=${pattern}`,
    ];

    for (const endpoint of searchEndpoints) {
      try {
        const res = await base.get(endpoint, {
          params: { agencyUid: ENV.AGENCY_UID }
        });
        
        const properties = res.data?.properties || res.data?.data || [];
        let newCount = 0;
        
        for (const prop of properties) {
          if (!allProperties.has(prop.uid)) {
            allProperties.set(prop.uid, prop);
            newCount++;
          }
        }
        
        if (properties.length > 0) {
          console.log(`  ${endpoint} -> ${properties.length} properties, ${newCount} new`);
        }
        
      } catch (e: any) {
        // Most will fail, that's expected
      }
    }
    
    await sleep(THROTTLE);
  }

  // Strategy 3: Try different property status filters
  console.log("\n3️⃣ TESTING STATUS FILTERS");
  console.log("─".repeat(40));
  
  const statusFilters = [
    { name: "draft", params: { status: "draft" } },
    { name: "pending", params: { status: "pending" } },
    { name: "published", params: { status: "published" } },
    { name: "paused", params: { status: "paused" } },
    { name: "archived", params: { status: "archived" } },
    { name: "deleted", params: { status: "deleted" } },
    { name: "all", params: { includeAll: true } },
    { name: "include everything", params: { includeArchived: true, includeDeleted: true, includeInactive: true } },
  ];

  for (const filter of statusFilters) {
    console.log(`Testing filter: ${filter.name}`);
    
    try {
      const res = await base.get("/properties", {
        params: { 
          agencyUid: ENV.AGENCY_UID, 
          limit: 50,
          ...filter.params 
        }
      });
      
      const properties = res.data?.properties || res.data?.data || [];
      let newCount = 0;
      
      for (const prop of properties) {
        if (!allProperties.has(prop.uid)) {
          allProperties.set(prop.uid, prop);
          newCount++;
        }
      }
      
      console.log(`  ${filter.name} -> ${properties.length} properties, ${newCount} new`);
      
    } catch (e: any) {
      console.log(`  ${filter.name} -> Error: ${e?.response?.status}`);
    }
    
    await sleep(THROTTLE);
  }

  // Strategy 4: Try different endpoints with various combinations
  console.log("\n4️⃣ TESTING ENDPOINT VARIATIONS");
  console.log("─".repeat(40));
  
  const endpointVariations = [
    "/properties/all",
    "/properties/list",
    "/properties/index",
    "/listings",
    "/units",
    "/rentals",
    "/accommodations",
    "/properties?type=all",
    "/properties?view=all",
    "/properties?scope=all",
  ];

  for (const endpoint of endpointVariations) {
    console.log(`Testing: ${endpoint}`);
    
    try {
      const res = await base.get(endpoint, {
        params: { agencyUid: ENV.AGENCY_UID, limit: 50 }
      });
      
      if (res.status === 200) {
        const properties = res.data?.properties || res.data?.data || res.data || [];
        let newCount = 0;
        
        if (Array.isArray(properties)) {
          for (const prop of properties) {
            if (prop?.uid && !allProperties.has(prop.uid)) {
              allProperties.set(prop.uid, prop);
              newCount++;
            }
          }
        }
        
        console.log(`  ✅ ${endpoint} -> ${Array.isArray(properties) ? properties.length : 'non-array'} items, ${newCount} new`);
      }
      
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 404) {
        console.log(`  ❌ ${endpoint} -> ${status}`);
      }
    }
    
    await sleep(THROTTLE);
  }

  // Strategy 5: Try manual UID discovery based on patterns
  console.log("\n5️⃣ TESTING UID PATTERN DISCOVERY");
  console.log("─".repeat(40));
  
  // We know some UIDs from the API response, let's see if there are patterns
  const knownUIDs = [
    "ac8d730c-2554-4547-986a-dda3bb2a6b62", // 4417-01 Grant
    "3fe4130f-a44c-42d1-9132-702af9d66f7c", // 4417-02 Austin
    "24b2b422-d78c-4b6c-aa35-7e408cc2f8ae", // 4417-03 Oak
  ];

  console.log(`Analyzing ${knownUIDs.length} known UIDs for patterns...`);
  
  // Try fetching individual properties to see if direct access works differently
  for (const uid of knownUIDs) {
    try {
      const res = await base.get(`/properties/${uid}`, {
        params: { agencyUid: ENV.AGENCY_UID }
      });
      
      if (res.data) {
        console.log(`  Direct fetch ${uid} -> SUCCESS`);
        
        // Check if the direct fetch returns different data or links to other properties
        const data = res.data;
        if (data.relatedProperties || data.similarProperties || data.groupProperties) {
          console.log(`    Found related properties metadata!`);
        }
      }
      
    } catch (e: any) {
      console.log(`  Direct fetch ${uid} -> Error: ${e?.response?.status}`);
    }
    
    await sleep(THROTTLE / 2);
  }

  // Final Summary
  console.log("\n📊 DISCOVERY SUMMARY");
  console.log("=====================================");
  console.log(`Total unique properties discovered: ${allProperties.size}`);
  console.log(`Portal shows: 87 properties`);
  console.log(`Missing: ${87 - allProperties.size} properties`);

  if (allProperties.size > 20) {
    console.log(`🎉 SUCCESS! Found ${allProperties.size - 20} additional properties!`);
  } else if (allProperties.size === 20) {
    console.log(`⚠️ Still only finding the same 20 properties`);
    console.log(`\n💡 RECOMMENDATIONS:`);
    console.log(`1. Contact Hostfully support - this appears to be an API bug`);
    console.log(`2. Check if you need different API permissions`);
    console.log(`3. Verify if properties are in different agencies/accounts`);
    console.log(`4. Try exporting from the web portal as a workaround`);
  }

  // Show sample of discovered properties
  if (allProperties.size > 0) {
    console.log(`\n📋 Sample discovered properties:`);
    const sample = Array.from(allProperties.values()).slice(0, 10);
    sample.forEach((prop, i) => {
      console.log(`   ${i + 1}. ${prop.uid} - ${prop.name || prop.title || 'Unnamed'}`);
    });
  }

  return Array.from(allProperties.values());
}