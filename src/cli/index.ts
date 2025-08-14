#!/usr/bin/env ts-node

import { Command } from "commander";
import { GraphQLHostfullyClient as HostfullyClient } from "../api/graphqlHostfullyClient";
import axios from "axios";
import { ENV } from "../utils/env";
import { 
  testGraphQLAccess, 
  exportAllPropertiesGraphQL, 
  generateGraphQLUpdateTemplate,
  bulkUpdateFromGraphQLCSV,
  listPropertiesSummary 
} from "./graphqlCommands";

// Investigation function (inline since we don't have separate file yet)
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

const program = new Command();

program
  .name("hostfully-csv")
  .description("Export/Import listings as CSV")
  .version("1.0.0");

program
  .command("diag")
  .description("Check API key and agency access")
  .action(async () => {
    const client = new HostfullyClient();
    try {
      const info = await client.whoAmI();
      console.log("OK:", info);
    } catch (e: any) {
      console.error("DIAG ERROR:", e?.response?.status, e?.response?.data || e?.message);
    }
  });

program
  .command("investigate")
  .description("Deep investigation of Hostfully API pagination issues")
  .action(async () => {
    await investigateAPI();
  });

// GraphQL Commands (Working Solution!)
program
  .command("graphql-test")
  .description("🎉 Test GraphQL access to get ALL properties")
  .option("--token <jwt>", "JWT token for authentication")
  .action(async (opts: any) => {
    await testGraphQLAccess(opts.token);
  });

program
  .command("graphql-export")
  .description("📂 Export ALL 87 properties using working GraphQL endpoint")
  .option("--output <dir>", "Output directory", "./exports")
  .action(async (opts: any) => {
    await exportAllPropertiesGraphQL(opts.output);
  });

program
  .command("graphql-list")
  .description("📋 List all properties with summary (using GraphQL)")
  .action(async () => {
    await listPropertiesSummary();
  });

program
  .command("graphql-template")
  .description("📝 Generate GraphQL bulk update template")
  .option("--output <file>", "Output file path", "./graphql_update_template.csv")
  .action(async (opts: any) => {
    await generateGraphQLUpdateTemplate(opts.output);
  });

program
  .command("graphql-bulk-update")
  .description("🔄 Bulk update properties using GraphQL")
  .argument("<csvFile>", "CSV file with updates")
  .option("--backup <dir>", "Backup directory", "./backups")
  .action(async (csvFile: string, opts: any) => {
    await bulkUpdateFromGraphQLCSV(csvFile, opts.backup);
  });

// Enhanced discovery commands
program
  .command("discover-schema")
  .description("🔍 Discover GraphQL schema to understand available arguments")
  .action(async () => {
    const client = new HostfullyClient();
    await client.discoverGraphQLSchema();
  });

program
  .command("discover-missing")
  .description("🎯 Target discovery for missing property units based on patterns")
  .action(async () => {
    const client = new HostfullyClient();
    console.log("🎯 Starting targeted discovery for missing units...\n");
    
    const missingProperties = await client.discoverMissingUnits();
    
    console.log(`\n📊 TARGETED DISCOVERY RESULTS:`);
    console.log(`Found ${missingProperties.length} additional properties`);
    
    if (missingProperties.length > 0) {
      console.log(`\n📋 New properties found:`);
      missingProperties.forEach((prop, i) => {
        console.log(`   ${i+1}. ${prop.uid} - ${prop.name || 'Unnamed'}`);
        console.log(`      Address: ${prop.address?.address}, ${prop.address?.city}`);
      });
    } else {
      console.log(`\n❌ No additional properties found through targeted discovery`);
      console.log(`Consider running 'npm start discover-schema' to debug available parameters`);
    }
  });

program
  .command("test-high-limit")
  .description("🚀 Test very high limits to bypass pagination entirely")
  .action(async () => {
    console.log("🚀 Testing high limits to bypass pagination...\n");
    
    const client = new HostfullyClient();
    
    // Test GraphQL with very high limits
    const testLimits = [500, 1000, 2000];
    
    for (const limit of testLimits) {
      try {
        console.log(`📡 Testing GraphQL with limit: ${limit}`);
        
        const query = `{
          properties(agencyUid: "${ENV.AGENCY_UID}", limit: ${limit}) {
            uid, name, isActive,
            address { address, city, state }
          }
        }`;
        
        const response = await (client as any).executeQuery(query, `HighLimit${limit}`);
        console.log(`   ✅ Limit ${limit}: Found ${response.length} properties`);
        
        if (response.length > 23) {
          console.log(`   🎉 SUCCESS! Found more than 23 properties with limit ${limit}!`);
          console.log(`   Sample new properties:`);
          response.slice(23, 28).forEach((prop: any, i: number) => {
            console.log(`      ${i+24}. ${prop.uid} - ${prop.name}`);
          });
          break;
        }
        
      } catch (error: any) {
        console.log(`   ❌ Limit ${limit}: Failed - ${error?.message}`);
      }
    }
    
    // Test REST API with high limits
    console.log(`\n📡 Testing REST API with high limits...`);
    
    for (const limit of testLimits) {
      try {
        const restResponse = await axios.get(`${ENV.BASE}/properties`, {
          params: { 
            agencyUid: ENV.AGENCY_UID, 
            limit: limit 
          },
          headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
        });
        
        const properties = restResponse.data?.properties || restResponse.data?.data || [];
        console.log(`   ✅ REST limit ${limit}: Found ${properties.length} properties`);
        
        if (properties.length > 23) {
          console.log(`   🎉 SUCCESS! REST API found more than 23 properties with limit ${limit}!`);
          break;
        }
        
      } catch (error: any) {
        console.log(`   ❌ REST limit ${limit}: Failed - ${error?.response?.status}`);
      }
    }
  });

// Fixed discover-all command
program
  .command("discover-all")
  .description("🔬 Advanced property discovery to find all 89 properties") 
  .option("--throttle <ms>", "Delay between API calls (ms)", "1500")
  .action(async (opts: any) => {
    const throttleMs = parseInt(opts.throttle, 10);
    if (Number.isFinite(throttleMs)) {
      process.env.THROTTLE_MS = String(throttleMs);
    }
    
    try {
      const { runAdvancedDiscovery } = await import("./advancedDiscovery");
      await runAdvancedDiscovery();
    } catch (e: any) {
      console.error("❌ Advanced discovery not available. Using built-in discovery...");
      
      // Fallback to our enhanced GraphQL discovery
      const client = new HostfullyClient();
      console.log("🔬 Running comprehensive property discovery...\n");
      
      const allProperties = await client.getAllProperties();
      
      console.log(`\n📊 COMPREHENSIVE DISCOVERY RESULTS:`);
      console.log(`Total properties found: ${allProperties.length}`);
      console.log(`Expected: 89 properties`);
      console.log(`Success rate: ${Math.round(allProperties.length / 89 * 100)}%`);
      
      if (allProperties.length > 23) {
        console.log(`🎉 SUCCESS! Found ${allProperties.length - 23} additional properties!`);
      }
    }
  });

// Test workaround strategies
program
  .command("test-workaround")
  .description("Test the workaround client strategies")
  .option("--debug", "Enable debug logging", false)
  .option("--throttle <ms>", "Delay between API calls (ms)", (v) => parseInt(v,10), 1000)
  .action(async (opts: any) => {
    if (opts.debug) process.env.DEBUG = "true";
    if (Number.isFinite(opts.throttle)) process.env.THROTTLE_MS = String(opts.throttle);
    
    console.log("🧪 Testing workaround strategies...\n");
    
    const client = new HostfullyClient();
    const properties = await client.listAllProperties();
    
    console.log(`\n📊 RESULTS:`);
    console.log(`Total properties found: ${properties.length}`);
    console.log(`Expected: 89 properties`);
    console.log(`Success rate: ${Math.round(properties.length / 89 * 100)}%`);
    
    if (properties.length > 20) {
      console.log(`🎉 SUCCESS! Found more than the stuck 20 properties.`);
    } else {
      console.log(`⚠️ Still stuck at ${properties.length} properties.`);
    }
    
    // Show sample of what we found
    if (properties.length > 0) {
      console.log(`\n📋 Sample properties:`);
      properties.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i+1}. ${p.uid} - ${p.name || p.title || 'Unnamed'}`);
      });
    }
  });

// Safe testing command
program
  .command("safe-test")
  .description("Safely test property update capabilities without affecting live data")
  .argument("[uid]", "Property UID to test (optional, will use first property if not provided)")
  .option("--dry-run", "Only simulate changes, don't actually update", true)
  .option("--live", "Allow actual updates (USE WITH CAUTION)", false)
  .option("--no-revert", "Don't automatically revert test changes", false)
  .action(async (uid: string | undefined, opts: any) => {
    try {
      const { SafePropertyTester } = await import("./safeTesting");
      
      // Get properties to test with
      const client = new HostfullyClient();
      const properties = await client.listAllProperties();
      
      if (properties.length === 0) {
        console.error("❌ No properties found to test with");
        return;
      }
      
      const testUid = uid || properties[0].uid;
      const tester = new SafePropertyTester({
        dryRun: !opts.live,
        revertAfter: !opts.noRevert,
        maxTestUpdates: 1
      });
      
      console.log(`🧪 SAFE TESTING MODE`);
      console.log(`Target property: ${testUid}`);
      console.log(`Dry run: ${!opts.live}`);
      console.log(`Will revert: ${!opts.noRevert}\n`);
      
      // Test reading
      await tester.testPropertyRead(testUid);
      
      // Discover update endpoints
      await tester.discoverUpdateEndpoints(testUid);
      
      // Test a safe update (description field)
      await tester.testSafeUpdate(testUid, 'description', `Safe test at ${new Date().toISOString()}`);
      
    } catch (e: any) {
      console.error("❌ Safe testing not available. Create src/cli/safeTesting.ts first.");
    }
  });

// Legacy export command
program
  .command("export")
  .description("Export listings to CSV from Hostfully (REST API)")
  .option("--region <region>", "Region label (for filename only)", "ALL")
  .option("--out <outDir>", "Output folder", "./exports")
  .option("--include-archived", "Include archived listings", false)
  .option("--debug", "Enable debug logging", false)
  .option("--throttle <ms>", "Delay between API calls (ms)", (v) => parseInt(v,10), 1000)
  .option("--start-page <n>", "Start page (resume)", (v)=>parseInt(v,10), 1)
  .option("--max-pages <n>", "Stop after N pages (safety cap)", (v)=>parseInt(v,10), 0)
  .option("--workaround", "Use workaround strategies for broken pagination", false)
  .action(async (opts:any) => {
    if (opts.debug) process.env.DEBUG = "true";
    if (Number.isFinite(opts.throttle)) process.env.THROTTLE_MS = String(opts.throttle);
    if (Number.isFinite(opts.startPage)) process.env.START_PAGE = String(opts.startPage);
    if (Number.isFinite(opts.maxPages)) process.env.MAX_PAGES = String(opts.maxPages);
    if (opts.workaround) process.env.USE_WORKAROUND = "true";
    
    try {
      const { runExport } = await import("./export");
      await runExport(opts);
    } catch (e: any) {
      console.error("❌ Legacy export not available. Create src/cli/export.ts first or use 'graphql-export' instead.");
    }
  });

program
  .command("diag-props")
  .description("Probe property pagination parameters")
  .option("--limit <n>", "Page size to use", (v)=>parseInt(v,10), 20)
  .action(async (opts:any) => {
    try {
      const { runDiagProps } = await import("./diagProps");
      await runDiagProps(opts.limit);
    } catch (e: any) {
      console.error("❌ Diag props not available. Create src/cli/diagProps.ts first.");
    }
  });


program.parse(process.argv);