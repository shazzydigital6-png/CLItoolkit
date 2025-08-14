#!/usr/bin/env ts-node

import { Command } from "commander";
import { GraphQLHostfullyClient as HostfullyClient } from "../api/graphqlHostfullyClient";
import axios from "axios";
import { ENV } from "../utils/env";
import * as fs from "fs";
import * as path from "path";
import { stringify } from "csv-stringify/sync";
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

// COMPREHENSIVE CSV EXPORT - The main command you want!
program
  .command("export-complete-csv")
  .description("📊 Export ALL 89 properties with EVERY available field to comprehensive CSV")
  .option("--output <dir>", "Output directory", "./exports")
  .option("--fetch-details", "Fetch detailed data for each property (slower but more complete)", false)
  .action(async (opts: any) => {
    console.log("📊 Exporting ALL properties with COMPLETE field data...\n");
    
    try {
      // Step 1: Get all properties using the working _limit parameter
      console.log("🔍 Step 1: Fetching all properties...");
      const response = await axios.get(`${ENV.BASE}/properties`, {
        params: { 
          agencyUid: ENV.AGENCY_UID,
          _limit: 200 // High limit to ensure we get everything
        },
        headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
      });
      
      const properties = response.data?.properties || response.data?.data || [];
      
      console.log(`✅ Retrieved ${properties.length} properties from API`);
      
      // Step 2: Optionally fetch detailed data for each property
      let detailedProperties = properties;
      
      if (opts.fetchDetails && properties.length > 0) {
        console.log(`🔍 Step 2: Fetching detailed data for each property...`);
        detailedProperties = [];
        
        for (let i = 0; i < properties.length; i++) {
          const property = properties[i];
          console.log(`   📋 Fetching details for property ${i + 1}/${properties.length}: ${property.name || property.uid}`);
          
          try {
            const detailResponse = await axios.get(`${ENV.BASE}/properties/${property.uid}`, {
              params: { agencyUid: ENV.AGENCY_UID },
              headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
            });
            
            const detailedProperty = detailResponse.data || property;
            detailedProperties.push(detailedProperty);
            
            // Small delay to avoid rate limiting
            if (i < properties.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
          } catch (error) {
            console.log(`   ⚠️ Could not fetch details for ${property.uid}, using basic data`);
            detailedProperties.push(property);
          }
        }
        
        console.log(`✅ Completed detailed data fetching`);
      }
      
      // Step 3: Discover all possible fields by examining all properties
      console.log(`🔍 Step 3: Analyzing all available fields...`);
      const allFields = new Set<string>();
      const fieldExamples = new Map<string, any>();
      const fieldCounts = new Map<string, number>();
      
      const flattenObject = (obj: any, prefix = '', depth = 0) => {
        if (depth > 5) return; // Prevent infinite recursion
        
        Object.keys(obj || {}).forEach(key => {
          const newKey = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];
          
          allFields.add(newKey);
          
          // Count how many properties have this field
          if (value !== null && value !== undefined && value !== '') {
            fieldCounts.set(newKey, (fieldCounts.get(newKey) || 0) + 1);
            
            if (!fieldExamples.has(newKey)) {
              fieldExamples.set(newKey, value);
            }
          }
          
          // Recursively flatten nested objects (but not arrays)
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            flattenObject(value, newKey, depth + 1);
          }
        });
      };
      
      detailedProperties.forEach(property => {
        flattenObject(property);
      });
      
      console.log(`📋 Found ${allFields.size} unique fields across all properties`);
      
      // Step 4: Create field mapping and statistics
      const fieldsArray = Array.from(allFields).sort();
      const fieldStats = fieldsArray.map(field => ({
        field,
        count: fieldCounts.get(field) || 0,
        percentage: Math.round(((fieldCounts.get(field) || 0) / detailedProperties.length) * 100),
        example: fieldExamples.get(field)
      }));
      
      console.log(`\n📊 Field Statistics (top 20 most common):`);
      fieldStats
        .filter(f => f.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .forEach(stat => {
          console.log(`   ${stat.field.padEnd(30)} | ${stat.count.toString().padStart(3)}/${detailedProperties.length} (${stat.percentage}%)`);
        });
      
      // Step 5: Helper functions for CSV formatting
      const getNestedValue = (obj: any, path: string): any => {
        return path.split('.').reduce((current, key) => {
          return current && current[key] !== undefined ? current[key] : null;
        }, obj);
      };
      
      const formatValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) {
          if (value.length === 0) return '';
          return JSON.stringify(value);
        }
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value).replace(/[\r\n]/g, ' ').trim();
      };
      
      // Step 6: Convert to comprehensive CSV format
      console.log(`🔍 Step 4: Converting to CSV format...`);
      const now = new Date().toISOString();
      
      const csvData = detailedProperties.map((property: any, index: number) => {
        const row: any = {
          // Add metadata columns first
          export_timestamp: now,
          property_index: index + 1,
          total_properties: detailedProperties.length,
          
          // Core identification fields
          uid: property.uid || '',
          name: property.name || property.title || '',
          isActive: property.isActive ? 'true' : 'false',
        };
        
        // Add all discovered fields
        fieldsArray.forEach(fieldPath => {
          const value = getNestedValue(property, fieldPath);
          row[fieldPath] = formatValue(value);
        });
        
        return row;
      });
      
      // Step 7: Create filename and save CSV
      const timestamp = now.replace(/[:.]/g, "-").split('T')[0] + '_' + now.split('T')[1].split('.')[0].replace(/:/g, '-');
      const filename = `hostfully_complete_export_${timestamp}.csv`;
      const filepath = path.join(opts.output, filename);
      
      // Ensure directory exists
      fs.mkdirSync(opts.output, { recursive: true });
      
      // Write CSV file
      console.log(`💾 Step 5: Writing CSV file...`);
      const csvContent = stringify(csvData, { 
        header: true,
        quoted: true, // Quote all fields to handle special characters
        quotedEmpty: false,
        quotedString: true
      });
      
      fs.writeFileSync(filepath, csvContent, "utf8");
      
      // Step 8: Generate summary report
      console.log(`\n🎉 SUCCESS! Comprehensive export completed!`);
      console.log(`═══════════════════════════════════════════`);
      console.log(`📁 File: ${filepath}`);
      console.log(`📊 Properties: ${detailedProperties.length}`);
      console.log(`📋 Fields: ${fieldsArray.length}`);
      console.log(`💾 File size: ${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB`);
      
      // Show breakdown by address
      const addressGroups = detailedProperties.reduce((groups: any, prop: any) => {
        const address = prop.address?.address || 'Unknown Address';
        groups[address] = (groups[address] || 0) + 1;
        return groups;
      }, {});
      
      console.log(`\n🏠 PROPERTY BREAKDOWN BY ADDRESS:`);
      Object.entries(addressGroups)
        .sort((a: any, b: any) => b[1] - a[1])
        .forEach(([address, count]) => {
          console.log(`   📍 ${address}: ${count} units`);
        });
      
      // Show field completeness summary
      console.log(`\n📊 FIELD COMPLETENESS SUMMARY:`);
      const completeFields = fieldStats.filter(f => f.percentage === 100).length;
      const mostlyCompleteFields = fieldStats.filter(f => f.percentage >= 80 && f.percentage < 100).length;
      const partialFields = fieldStats.filter(f => f.percentage > 0 && f.percentage < 80).length;
      const emptyFields = fieldStats.filter(f => f.percentage === 0).length;
      
      console.log(`   ✅ Complete (100%): ${completeFields} fields`);
      console.log(`   🟡 Mostly complete (80-99%): ${mostlyCompleteFields} fields`);
      console.log(`   🟠 Partial data (1-79%): ${partialFields} fields`);
      console.log(`   ❌ Empty (0%): ${emptyFields} fields`);
      
      console.log(`\n💡 Next steps:`);
      console.log(`   1. Open ${filename} in Excel or Google Sheets`);
      console.log(`   2. Use --fetch-details flag for even more complete data (slower)`);
      console.log(`   3. Filter/analyze the data as needed`);
      
    } catch (error: any) {
      console.error("❌ Export failed:", error?.response?.status, error?.response?.statusText, error?.message);
      if (error?.response?.data) {
        console.error("Response data:", error.response.data);
      }
    }
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
    
    // Test REST API with high limits using correct _limit parameter
    console.log(`\n📡 Testing REST API with high limits...`);
    
    for (const limit of testLimits) {
      try {
        const restResponse = await axios.get(`${ENV.BASE}/properties`, {
          params: { 
            agencyUid: ENV.AGENCY_UID, 
            _limit: limit  // Use _limit (the working parameter)
          },
          headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
        });
        
        const properties = restResponse.data?.properties || restResponse.data?.data || [];
        console.log(`   ✅ REST _limit ${limit}: Found ${properties.length} properties`);
        
        if (properties.length > 23) {
          console.log(`   🎉 SUCCESS! REST API found more than 23 properties with _limit ${limit}!`);
          break;
        }
        
      } catch (error: any) {
        console.log(`   ❌ REST _limit ${limit}: Failed - ${error?.response?.status}`);
      }
    }
  });

// Test updatedSince parameter
program
  .command("test-updated-since")
  .description("🕒 Test updatedSince parameter to find older properties")
  .action(async () => {
    console.log("🕒 Testing updatedSince parameter to find missing properties...\n");
    console.log("💡 Theory: Missing properties might be older and filtered by updatedSince\n");
    
    const allFoundProperties = new Set<string>();
    
    // Test different updatedSince dates going back in time
    const testDates = [
      { date: null, label: "no filter (current behavior)" },
      { date: "2024-01-01T00:00:00Z", label: "since beginning of 2024" },
      { date: "2023-01-01T00:00:00Z", label: "since beginning of 2023" },
      { date: "2022-01-01T00:00:00Z", label: "since beginning of 2022" },
      { date: "2021-01-01T00:00:00Z", label: "since beginning of 2021" },
      { date: "2020-01-01T00:00:00Z", label: "since beginning of 2020" },
      { date: "2019-01-01T00:00:00Z", label: "very old properties (2019+)" },
      { date: "2018-01-01T00:00:00Z", label: "ancient properties (2018+)" },
    ];
    
    for (const { date, label } of testDates) {
      try {
        console.log(`📡 Testing updatedSince: ${label}`);
        
        // Build params object
        const params: any = { 
          agencyUid: ENV.AGENCY_UID,
          _limit: 200 // Use _limit as per API docs
        };
        
        // Only add updatedSince if we have a date
        if (date) {
          params.updatedSince = date;
        }
        
        // Direct REST API call with updatedSince parameter
        const response = await axios.get(`${ENV.BASE}/properties`, {
          params,
          headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
        });
        
        const properties = response.data?.properties || response.data?.data || [];
        let newCount = 0;
        
        properties.forEach((prop: any) => {
          if (!allFoundProperties.has(prop.uid)) {
            allFoundProperties.add(prop.uid);
            newCount++;
          }
        });
        
        console.log(`   ✅ ${label}: Found ${properties.length} total, ${newCount} new properties`);
        console.log(`   📊 Running total: ${allFoundProperties.size} unique properties`);
        
        if (allFoundProperties.size > 50) {
          console.log(`   🎉 BREAKTHROUGH! Found ${allFoundProperties.size} properties!`);
        }
        
        // Show sample of newest properties found
        if (newCount > 0) {
          const newProps = properties.filter((p: any) => !allFoundProperties.has(p.uid) || newCount > 0).slice(0, 3);
          console.log(`   🆕 Sample new: ${newProps.map((p: any) => p.name || p.title || p.uid.slice(0,8)).join(", ")}`);
        }
        
      } catch (error: any) {
        console.log(`   ❌ ${label}: Failed - ${error?.response?.status} ${error?.response?.statusText || error?.message}`);
      }
    }
    
    console.log(`\n🎯 FINAL UPDATEDLSINCE RESULTS:`);
    console.log(`═══════════════════════════════`);
    console.log(`Total unique properties found: ${allFoundProperties.size}`);
    console.log(`Expected: 89 properties`);
    console.log(`Success rate: ${Math.round(allFoundProperties.size / 89 * 100)}%`);
    
    if (allFoundProperties.size > 23) {
      console.log(`🎉 SUCCESS! Found ${allFoundProperties.size - 23} additional properties!`);
      console.log(`💡 The updatedSince parameter was the key!`);
      console.log(`🔧 Recommendation: Use updatedSince=2018-01-01T00:00:00Z for complete data`);
    } else {
      console.log(`😞 Still only found ${allFoundProperties.size} properties`);
      console.log(`💭 The updatedSince parameter didn't reveal additional properties`);
    }
  });

// Test using proper API parameter names from documentation
program
  .command("test-api-params")
  .description("🔬 Test proper API parameter names from documentation (_limit, _cursor)")
  .action(async () => {
    console.log("🔬 Testing proper API parameter names from documentation...\n");
    
    const allFoundProperties = new Set<string>();
    
    // Test different combinations of proper API parameters
    const paramTests = [
      { name: "high _limit", params: { agencyUid: ENV.AGENCY_UID, _limit: 500 } },
      { name: "high limit (old)", params: { agencyUid: ENV.AGENCY_UID, limit: 500 } },
      { name: "_limit + updatedSince", params: { agencyUid: ENV.AGENCY_UID, _limit: 200, updatedSince: "2020-01-01T00:00:00Z" } },
      { name: "no _limit", params: { agencyUid: ENV.AGENCY_UID } },
      { name: "agencyUID (capital)", params: { agencyUID: ENV.AGENCY_UID, _limit: 200 } },
      { name: "minimal params", params: { agencyUid: ENV.AGENCY_UID, _limit: 10 } },
    ];
    
    for (const test of paramTests) {
      try {
        console.log(`📡 Testing: ${test.name}`);
        
        const response = await axios.get(`${ENV.BASE}/properties`, {
          params: test.params,
          headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
        });
        
        const properties = response.data?.properties || response.data?.data || [];
        let newCount = 0;
        
        properties.forEach((prop: any) => {
          if (!allFoundProperties.has(prop.uid)) {
            allFoundProperties.add(prop.uid);
            newCount++;
          }
        });
        
        console.log(`   ✅ ${test.name}: Found ${properties.length} total, ${newCount} new`);
        console.log(`   📊 Running total: ${allFoundProperties.size} unique properties`);
        
      } catch (error: any) {
        console.log(`   ❌ ${test.name}: Failed - ${error?.response?.status}`);
      }
    }
    
    console.log(`\n📊 API Parameters Test Results: ${allFoundProperties.size} total properties found`);
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