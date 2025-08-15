#!/usr/bin/env ts-node

import { Command } from "commander";
import { GraphQLHostfullyClient } from "../api/graphqlHostfullyClient";
import { HostfullyClient } from "../api/hostfullyClient";
import axios from "axios";
import { ENV } from "../utils/env";
import * as fs from "fs";
import * as path from "path";
import { stringify } from "csv-stringify/sync";

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

  console.log(`\n✅ INVESTIGATION COMPLETE`);
  console.log(`=====================================`);
  console.log(`💡 Next steps:`);
  console.log(`   1. Look for endpoints/filters that return different UIDs`);
  console.log(`   2. Try the workaround client with multiple strategies`);
  console.log(`   3. Contact Hostfully support with these findings`);
}

// GraphQL Commands Implementation
async function testGraphQLAccess(token?: string) {
  console.log("🎉 Testing GraphQL access to get ALL properties");
  const client = new GraphQLHostfullyClient(token);
  
  try {
    const info = await client.whoAmI();
    console.log("✅ GraphQL access working:", info);
  } catch (error: any) {
    console.error("❌ GraphQL access failed:", error.message);
  }
}

async function exportAllPropertiesGraphQL(outputDir: string) {
  console.log("📂 Export ALL 87+ properties using working GraphQL endpoint");
  
  const client = new GraphQLHostfullyClient();
  const properties = await client.getAllProperties();
  
  if (properties.length === 0) {
    console.error("❌ No properties found to export");
    return;
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate comprehensive CSV with all fields
  await generateComprehensiveCSV(properties, outputDir, "graphql_export");
  
  console.log(`🎉 GraphQL export completed! Found ${properties.length} properties`);
}

async function listPropertiesSummary() {
  console.log("📋 List all properties with summary (using GraphQL)");
  
  const client = new GraphQLHostfullyClient();
  const properties = await client.getAllProperties();
  
  console.log(`\n📊 PROPERTY SUMMARY (${properties.length} total):`);
  console.log("═".repeat(50));
  
  properties.forEach((prop, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${prop.uid}`);
    console.log(`    📋 ${prop.name || 'Unnamed'}`);
    console.log(`    🏠 ${prop.address?.address || 'No address'}, ${prop.address?.city || 'No city'}`);
    console.log(`    ${prop.isActive ? '✅ Active' : '❌ Inactive'}`);
    console.log('');
  });
}

async function generateGraphQLUpdateTemplate(outputFile: string) {
  console.log("📝 Generate GraphQL bulk update template");
  
  const client = new GraphQLHostfullyClient();
  const properties = await client.getAllProperties();
  
  if (properties.length === 0) {
    console.error("❌ No properties found for template");
    return;
  }

  const templateData = properties.map(prop => ({
    uid: prop.uid,
    name: prop.name || '',
    description: '', // Will be filled by user
    isActive: prop.isActive ? 'true' : 'false',
    // Add more fields as needed for updates
    notes: 'Add your update notes here'
  }));

  const csvContent = stringify(templateData, { header: true });
  fs.writeFileSync(outputFile, csvContent, 'utf8');
  
  console.log(`✅ Template generated: ${outputFile}`);
}

async function bulkUpdateFromGraphQLCSV(csvFile: string, backupDir: string) {
  console.log(`🔄 Bulk update properties using GraphQL from CSV: ${csvFile}`);
  
  if (!fs.existsSync(csvFile)) {
    console.error(`❌ CSV file not found: ${csvFile}`);
    return;
  }

  // Create backup directory
  fs.mkdirSync(backupDir, { recursive: true });
  
  const client = new GraphQLHostfullyClient();
  
  // Read and parse CSV - Use a proper CSV parser for production
  const csvContent = fs.readFileSync(csvFile, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error("❌ CSV file appears to be empty or invalid");
    return;
  }
  
  // Simple CSV parsing (for production, use a proper CSV library)
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const updates = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    if (values.length >= headers.length) {
      const update: any = {};
      headers.forEach((header, index) => {
        if (values[index]) {
          update[header] = values[index];
        }
      });
      
      if (update.uid) {
        updates.push({
          uid: update.uid,
          data: update
        });
      }
    }
  }
  
  console.log(`📝 Parsed ${updates.length} updates from CSV`);
  
  if (updates.length === 0) {
    console.error("❌ No valid updates found in CSV");
    return;
  }
  
  // Create backup before updating
  console.log("💾 Creating backup...");
  const backupProperties = await client.getAllProperties();
  const backupFilename = `backup_${new Date().toISOString().split('T')[0]}.json`;
  const backupPath = path.join(backupDir, backupFilename);
  fs.writeFileSync(backupPath, JSON.stringify(backupProperties, null, 2), 'utf8');
  console.log(`✅ Backup created: ${backupPath}`);
  
  // Check if bulk update method exists, otherwise do individual updates
  if (typeof client.bulkUpdateProperties === 'function') {
    const results = await client.bulkUpdateProperties(updates);
    console.log(`\n📊 Bulk Update Results:`);
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
  } else {
    console.log("⚠️ Bulk update method not available, performing individual updates...");
    let successful = 0;
    let failed = 0;
    
    for (const update of updates) {
      try {
        if (typeof client.updateProperty === 'function') {
          const success = await client.updateProperty(update.uid, update.data);
          if (success) successful++;
          else failed++;
        } else {
          console.log(`   ⚠️ Update method not implemented for ${update.uid}`);
          failed++;
        }
        
        // Small delay between updates
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`   ❌ Failed to update ${update.uid}:`, error);
        failed++;
      }
    }
    
    console.log(`\n📊 Individual Update Results:`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
  }
  
  console.log(`📁 Backup: ${backupPath}`);
}

// Enhanced description parsing function to extract all individual fields
function parsePropertyDescriptions(property: any, descriptionsResponse: any): void {
  console.log(`   🔍 Parsing descriptions for ${property.uid}...`);
  
  // Handle the API response structure
  let descriptionsArray: any[] = [];
  
  if (Array.isArray(descriptionsResponse)) {
    // Response is directly an array
    descriptionsArray = descriptionsResponse;
  } else if (descriptionsResponse?.propertyDescriptions && Array.isArray(descriptionsResponse.propertyDescriptions)) {
    // Response has propertyDescriptions wrapper
    descriptionsArray = descriptionsResponse.propertyDescriptions;
  } else if (descriptionsResponse?.data?.propertyDescriptions && Array.isArray(descriptionsResponse.data.propertyDescriptions)) {
    // Response has data.propertyDescriptions wrapper
    descriptionsArray = descriptionsResponse.data.propertyDescriptions;
  }
  
  console.log(`   📋 Found ${descriptionsArray.length} description(s)`);
  
  if (descriptionsArray.length > 0) {
    // Store the raw descriptions for reference
    property.rawDescriptions = descriptionsArray;
    
    // Process each description (usually just one, but could be multiple locales)
    descriptionsArray.forEach((desc: any, index: number) => {
      const prefix = index === 0 ? '' : `_${desc.locale || index}`;
      
      // Extract all individual description fields as separate columns
      // These match the fields shown in your Hostfully interface screenshots
      
      // Basic info
      property[`description${prefix}_name`] = desc.name || '';
      property[`description${prefix}_locale`] = desc.locale || 'en_US';
      
      // Main description fields (as shown in your screenshots)
      property[`description${prefix}_shortSummary`] = desc.shortSummary || '';
      property[`description${prefix}_longDescription`] = desc.summary || ''; // "Long Description" in UI
      property[`description${prefix}_notes`] = desc.notes || '';
      property[`description${prefix}_interaction`] = desc.interaction || '';
      property[`description${prefix}_neighbourhood`] = desc.neighbourhood || '';
      property[`description${prefix}_space`] = desc.space || '';
      property[`description${prefix}_access`] = desc.access || '';
      property[`description${prefix}_transit`] = desc.transit || '';
      property[`description${prefix}_houseManual`] = desc.houseManual || '';
      
      // Clean up the text fields (remove extra whitespace, line breaks)
      const textFields = [
        `description${prefix}_name`,
        `description${prefix}_shortSummary`, 
        `description${prefix}_longDescription`,
        `description${prefix}_notes`,
        `description${prefix}_interaction`,
        `description${prefix}_neighbourhood`,
        `description${prefix}_space`,
        `description${prefix}_access`,
        `description${prefix}_transit`,
        `description${prefix}_houseManual`
      ];
      
      textFields.forEach(field => {
        if (property[field]) {
          // Clean up the text: normalize whitespace, remove special characters that break CSV
          property[field] = property[field]
            .replace(/[\r\n\t]/g, ' ')  // Replace line breaks with spaces
            .replace(/\s+/g, ' ')        // Collapse multiple spaces
            .replace(/"/g, '""')         // Escape quotes for CSV
            .trim();                     // Remove leading/trailing spaces
        }
      });
      
      console.log(`   ✅ Extracted description ${index + 1}: "${desc.name?.substring(0, 50)}..."`);
    });
    
    // For convenience, also create "main" versions (from the first description)
    const mainDesc = descriptionsArray[0];
    property.main_description_name = mainDesc.name || '';
    property.main_description_shortSummary = mainDesc.shortSummary || '';
    property.main_description_longDescription = mainDesc.summary || '';
    property.main_description_notes = mainDesc.notes || '';
    property.main_description_interaction = mainDesc.interaction || '';
    property.main_description_neighbourhood = mainDesc.neighbourhood || '';
    property.main_description_space = mainDesc.space || '';
    property.main_description_access = mainDesc.access || '';
    property.main_description_transit = mainDesc.transit || '';
    property.main_description_houseManual = mainDesc.houseManual || '';
    property.main_description_locale = mainDesc.locale || 'en_US';
    
    // Character counts for each field (useful for editing)
    property.description_name_length = (mainDesc.name || '').length;
    property.description_shortSummary_length = (mainDesc.shortSummary || '').length;
    property.description_longDescription_length = (mainDesc.summary || '').length;
    property.description_notes_length = (mainDesc.notes || '').length;
    property.description_interaction_length = (mainDesc.interaction || '').length;
    property.description_neighbourhood_length = (mainDesc.neighbourhood || '').length;
    property.description_space_length = (mainDesc.space || '').length;
    property.description_access_length = (mainDesc.access || '').length;
    property.description_transit_length = (mainDesc.transit || '').length;
    property.description_houseManual_length = (mainDesc.houseManual || '').length;
    
    console.log(`   📊 Description stats: Name=${property.description_name_length}chars, Summary=${property.description_shortSummary_length}chars`);
    
  } else {
    console.log(`   ⚠️ No descriptions found for ${property.uid}`);
    
    // Set empty values for all description fields
    const emptyFields = [
      'description_name', 'description_locale', 'description_shortSummary', 
      'description_longDescription', 'description_notes', 'description_interaction',
      'description_neighbourhood', 'description_space', 'description_access', 
      'description_transit', 'description_houseManual',
      'main_description_name', 'main_description_shortSummary', 'main_description_longDescription',
      'main_description_notes', 'main_description_interaction', 'main_description_neighbourhood',
      'main_description_space', 'main_description_access', 'main_description_transit',
      'main_description_houseManual', 'main_description_locale'
    ];
    
    emptyFields.forEach(field => {
      property[field] = '';
    });
    
    // Set length counters to 0
    const lengthFields = [
      'description_name_length', 'description_shortSummary_length', 'description_longDescription_length',
      'description_notes_length', 'description_interaction_length', 'description_neighbourhood_length',
      'description_space_length', 'description_access_length', 'description_transit_length',
      'description_houseManual_length'
    ];
    
    lengthFields.forEach(field => {
      property[field] = 0;
    });
  }
}

// FIXED: Enhanced REST API export with proper description field separation
async function exportAllPropertiesRESTFocused(outputDir: string) {
  console.log("🔧 Using REST API to get ALL properties with SEPARATED description fields...\n");
  
  // Use the workaround client to get all properties
  const workaroundClient = new HostfullyClient();
  const allProperties = await workaroundClient.listAllProperties();

  if (allProperties.length === 0) {
    console.error("❌ No properties found! Check API credentials.");
    return;
  }

  console.log(`📝 Fetching and parsing descriptions for ${allProperties.length} properties...`);
  
  // Fetch descriptions for all properties
  for (let i = 0; i < allProperties.length; i++) {
    const property = allProperties[i];
    
    try {
      console.log(`   📄 Fetching description ${i + 1}/${allProperties.length}: ${property.name || property.uid}`);
      
      const descResponse = await axios.get(`${ENV.BASE}/property-descriptions`, {
        params: { 
          propertyUid: property.uid,
          agencyUid: ENV.AGENCY_UID
        },
        headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY },
        timeout: 10000
      });
      
      // Use the enhanced parser to extract all fields
      parsePropertyDescriptions(property, descResponse.data);
      
    } catch (error: any) {
      console.log(`   ❌ Could not fetch description for ${property.uid}: ${error?.response?.status}`);
      console.log(`   📋 Error: ${error?.response?.data?.apiErrorMessage || error?.message}`);
      
      // Use the parser with empty data to set empty fields
      parsePropertyDescriptions(property, null);
    }
    
    // Rate limiting delay
    if (i < allProperties.length - 1) {
      await new Promise(resolve => setTimeout(resolve, ENV.THROTTLE_MS));
    }
  }
  
  console.log(`✅ Completed fetching and parsing descriptions for ${allProperties.length} properties`);

  console.log(`\n📊 EXPORT SUMMARY:`);
  console.log(`Total properties found: ${allProperties.length}`);
  
  const propertiesWithDescriptions = allProperties.filter(p => p.description_name);
  console.log(`Properties with descriptions: ${propertiesWithDescriptions.length}`);
  console.log(`Properties without descriptions: ${allProperties.length - propertiesWithDescriptions.length}`);

  // Generate comprehensive CSV with separate description columns
  fs.mkdirSync(outputDir, { recursive: true });
  await generateComprehensiveCSV(allProperties, outputDir, "properties_with_separated_descriptions");
  
  console.log(`\n📋 Description fields that will appear as separate CSV columns:`);
  console.log(`   - description_name (Property name/title)`);
  console.log(`   - description_shortSummary (Short description)`);
  console.log(`   - description_longDescription (Long description/summary)`);
  console.log(`   - description_notes (Notes/additional info)`);
  console.log(`   - description_interaction (Host interaction)`);
  console.log(`   - description_neighbourhood (Neighborhood info)`);
  console.log(`   - description_space (Space description)`);
  console.log(`   - description_access (Access instructions)`);
  console.log(`   - description_transit (Transit info)`);
  console.log(`   - description_houseManual (House rules/manual)`);
  console.log(`   - description_locale (Language locale)`);
  console.log(`   + Character count fields for each (*_length)`);
  
  return allProperties;
}

// Enhanced CSV generation function
async function generateComprehensiveCSV(properties: any[], outputDir: string, prefix: string = "export") {
  console.log("🔍 Analyzing all property fields...");
  
  // Discover all fields by flattening all properties
  const allFields = new Set<string>();
  const fieldExamples = new Map<string, any>();
  const fieldCounts = new Map<string, number>();
  
  const flattenObject = (obj: any, prefix = '', depth = 0) => {
    if (depth > 5 || !obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      
      allFields.add(newKey);
      
      // Count non-empty values
      if (value !== null && value !== undefined && value !== '') {
        fieldCounts.set(newKey, (fieldCounts.get(newKey) || 0) + 1);
        if (!fieldExamples.has(newKey)) {
          fieldExamples.set(newKey, value);
        }
      }
      
      // Recursively flatten objects (but not arrays)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        flattenObject(value, newKey, depth + 1);
      }
    });
  };
  
  properties.forEach(property => flattenObject(property));
  
  const fieldsArray = Array.from(allFields).sort();
  console.log(`📋 Discovered ${fieldsArray.length} unique fields`);
  
  // Helper functions
  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  };
  
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      if (value.length === 0) return '';
      // Join simple arrays or stringify complex ones
      if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
        return value.join('; ');
      }
      return JSON.stringify(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).replace(/[\r\n\t]/g, ' ').trim();
  };
  
  // Generate CSV data
  console.log("📝 Converting to CSV format...");
  const timestamp = new Date().toISOString();
  
  const csvData = properties.map((property: any, index: number) => {
    const row: any = {
      // Metadata columns
      export_timestamp: timestamp,
      property_index: index + 1,
      total_properties: properties.length,
      
      // Core identification
      uid: property.uid || '',
      name: property.name || property.title || '',
      isActive: property.isActive ? 'true' : 'false',
    };
    
    // Add all discovered fields
    fieldsArray.forEach(fieldPath => {
      // Skip if already added above
      if (!row.hasOwnProperty(fieldPath)) {
        const value = getNestedValue(property, fieldPath);
        row[fieldPath] = formatValue(value);
      }
    });
    
    return row;
  });
  
  // Generate filename
  const dateStr = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  const filename = `${prefix}_${dateStr}_${timeStr}.csv`;
  const filepath = path.join(outputDir, filename);
  
  // Write CSV
  console.log("💾 Writing CSV file...");
  const csvContent = stringify(csvData, { 
    header: true,
    quoted: true
  });
  
  fs.writeFileSync(filepath, csvContent, "utf8");
  
  // Generate summary
  const fileSize = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);
  
  console.log(`\n🎉 CSV Export Complete!`);
  console.log(`═══════════════════════════════════════`);
  console.log(`📁 File: ${filepath}`);
  console.log(`📊 Properties: ${properties.length}`);
  console.log(`📋 Fields: ${fieldsArray.length}`);
  console.log(`💾 Size: ${fileSize} MB`);
  
  // Field completeness stats
  const fieldStats = fieldsArray.map(field => ({
    field,
    count: fieldCounts.get(field) || 0,
    percentage: Math.round(((fieldCounts.get(field) || 0) / properties.length) * 100)
  }));
  
  console.log(`\n📊 Field Completeness:`);
  const completeFields = fieldStats.filter(f => f.percentage === 100).length;
  const mostlyComplete = fieldStats.filter(f => f.percentage >= 80 && f.percentage < 100).length;
  const partial = fieldStats.filter(f => f.percentage > 0 && f.percentage < 80).length;
  const empty = fieldStats.filter(f => f.percentage === 0).length;
  
  console.log(`   ✅ Complete (100%): ${completeFields} fields`);
  console.log(`   🟡 Mostly complete (80-99%): ${mostlyComplete} fields`);
  console.log(`   🟠 Partial data (1-79%): ${partial} fields`);
  console.log(`   ❌ Empty (0%): ${empty} fields`);
  
  // Show description field stats
  const descriptionFields = fieldsArray.filter(f => f.includes('description'));
  if (descriptionFields.length > 0) {
    console.log(`\n📝 Description Fields Found: ${descriptionFields.length}`);
    descriptionFields.forEach(field => {
      const count = fieldCounts.get(field) || 0;
      const percentage = Math.round((count / properties.length) * 100);
      console.log(`   ${field}: ${count}/${properties.length} (${percentage}%)`);
    });
  }
  
  // Address breakdown
  const addressGroups = properties.reduce((groups: any, prop: any) => {
    const address = getNestedValue(prop, 'address.address') || 'Unknown Address';
    groups[address] = (groups[address] || 0) + 1;
    return groups;
  }, {});
  
  console.log(`\n🏠 Properties by Address (Top 10):`);
  Object.entries(addressGroups)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([address, count]) => {
      console.log(`   📍 ${String(address).substring(0, 60)}: ${count}`);
    });
  
  return filepath;
}

// Initialize the CLI program
const program = new Command();

program
  .name("hostfully-csv")
  .description("Export/Import listings as CSV")
  .version("1.0.0");

program
  .command("diag")
  .description("Check API key and agency access")
  .action(async () => {
    const client = new GraphQLHostfullyClient();
    try {
      const info = await client.whoAmI();
      console.log("✅ API Connection OK:", info);
    } catch (e: any) {
      console.error("❌ DIAG ERROR:", e.message);
    }
  });

program
  .command("investigate")
  .description("Deep investigation of Hostfully API pagination issues")
  .action(async () => {
    await investigateAPI();
  });

// MAIN EXPORT COMMANDS
program
  .command("export-complete-csv")
  .description("📊 Export ALL properties with EVERY available field to comprehensive CSV")
  .option("--output <dir>", "Output directory", "./exports")
  .option("--fetch-details", "Fetch detailed data for each property (slower but more complete)", false)
  .action(async (opts: any) => {
    console.log("📊 Exporting ALL properties with COMPLETE field data...\n");
    
    try {
      console.log("🔍 Step 1: Fetching all properties using GraphQL client...");
      const client = new GraphQLHostfullyClient();
      let allProperties = await client.getAllProperties();
      
      if (allProperties.length === 0) {
        console.error("❌ No properties found! Check API credentials.");
        return;
      }
      
      console.log(`✅ Retrieved ${allProperties.length} properties from GraphQL`);
      
      if (opts.fetchDetails && allProperties.length > 0) {
        console.log(`🔍 Step 2: Fetching detailed data for each property...`);
        const detailedProperties = [];
        
        for (let i = 0; i < allProperties.length; i++) {
          const property = allProperties[i];
          console.log(`   📋 Fetching details for property ${i + 1}/${allProperties.length}: ${property.name || property.uid}`);
          
          try {
            if (typeof client.getPropertyDetails === 'function') {
              const detailedProperty = await client.getPropertyDetails(property.uid);
              detailedProperties.push(detailedProperty || property);
            } else {
              const detailResponse = await axios.get(`${ENV.BASE}/properties/${property.uid}`, {
                params: { agencyUid: ENV.AGENCY_UID },
                headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
              });
              detailedProperties.push(detailResponse.data || property);
            }
            
            if (i < allProperties.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
          } catch (error) {
            console.log(`   ⚠️ Could not fetch details for ${property.uid}, using basic data`);
            detailedProperties.push(property);
          }
        }
        
        allProperties = detailedProperties;
        console.log(`✅ Completed detailed data fetching`);
      }
      
      await generateComprehensiveCSV(allProperties, opts.output, "hostfully_complete_export");
      
      console.log(`\n🎯 EXPORT SUMMARY:`);
      console.log(`Total properties: ${allProperties.length}/89 expected`);
      console.log(`Success rate: ${Math.round(allProperties.length / 89 * 100)}%`);
      
      if (allProperties.length >= 85) {
        console.log(`🎉 Excellent! Found ${allProperties.length}/89 properties`);
      } else if (allProperties.length >= 70) {
        console.log(`👍 Good! Found ${allProperties.length}/89 properties`);
      } else {
        console.log(`⚠️ Only found ${allProperties.length}/89 properties`);
        console.log(`💡 Try running 'export-rest-focused' command to use REST API approach`);
      }
      
    } catch (error: any) {
      console.error("❌ Export failed:", error.message);
      if (error?.response?.data) {
        console.error("API Response:", error.response.data);
      }
    }
  });

program
  .command("export-rest-focused")
  .description("🔧 Export ALL properties using focused REST API with _limit parameter")
  .option("--output <dir>", "Output directory", "./exports")
  .action(async (opts: any) => {
    await exportAllPropertiesRESTFocused(opts.output);
  });

// MAIN COMMAND: Export with descriptions
program
  .command("export-with-descriptions")
  .description("📝 Export ALL properties with descriptions included")
  .option("--output <dir>", "Output directory", "./exports")
  .action(async (opts: any) => {
    console.log("📝 Exporting ALL properties WITH descriptions...\n");
    await exportAllPropertiesRESTFocused(opts.output);
  });

// DEBUG AND TEST COMMANDS
program
  .command("debug-descriptions")
  .description("🔍 Debug: Fetch descriptions for first 3 properties")
  .action(async () => {
    console.log("🔍 Debug: Testing descriptions for first 3 properties...\n");
    
    try {
      // Get first 3 properties using workaround client
      const workaroundClient = new HostfullyClient();
      const allProperties = await workaroundClient.listAllProperties();
      const properties = allProperties.slice(0, 3);
      
      if (properties.length === 0) {
        console.error("❌ No properties found");
        return;
      }
      
      console.log(`📋 Testing with ${properties.length} properties:\n`);
      
      for (let i = 0; i < properties.length; i++) {
        const property = properties[i];
        console.log(`🏠 Property ${i + 1}: ${property.uid} - ${property.name || 'Unnamed'}`);
        
        try {
          const descResponse = await axios.get(`${ENV.BASE}/property-descriptions`, {
            params: { 
              propertyUid: property.uid,
              agencyUid: ENV.AGENCY_UID
            },
            headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
          });
          
          const descriptionsArray = descResponse.data?.propertyDescriptions || [];
          
          if (descriptionsArray && descriptionsArray.length > 0) {
            // Use the enhanced parser
            parsePropertyDescriptions(property, descResponse.data);
            
            const desc = descriptionsArray[0];
            console.log(`   ✅ Found description: "${desc.name}"`);
            console.log(`   📝 Short summary: ${desc.shortSummary?.substring(0, 100)}...`);
            console.log(`   📋 Has summary: ${desc.summary ? 'Yes' : 'No'}`);
            console.log(`   📋 Has notes: ${desc.notes ? 'Yes' : 'No'}`);
            console.log(`   📋 Has house manual: ${desc.houseManual ? 'Yes' : 'No'}`);
            console.log(`   📋 Has neighbourhood: ${desc.neighbourhood ? 'Yes' : 'No'}`);
            console.log(`   📋 Has interaction: ${desc.interaction ? 'Yes' : 'No'}`);
            console.log(`   📋 Has space: ${desc.space ? 'Yes' : 'No'}`);
            console.log(`   📋 Has access: ${desc.access ? 'Yes' : 'No'}`);
            console.log(`   📋 Has transit: ${desc.transit ? 'Yes' : 'No'}`);
            
            console.log(`   🔧 Parsed into separate fields successfully`);
          } else {
            console.log(`   ❌ No descriptions found`);
            parsePropertyDescriptions(property, null);
          }
          
        } catch (error: any) {
          console.log(`   ❌ Error fetching description: ${error?.response?.status} - ${error?.message}`);
        }
        
        console.log('');
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Test CSV generation with these properties
      console.log("🧪 Testing CSV generation...");
      const testOutputDir = "./test-exports";
      fs.mkdirSync(testOutputDir, { recursive: true });
      
      await generateComprehensiveCSV(properties, testOutputDir, "debug_test");
      console.log("✅ Debug test complete!");
      
    } catch (error: any) {
      console.error("❌ Debug test failed:", error.message);
    }
  });

program
  .command("test-descriptions")
  .description("🧪 Test property descriptions API with first property")
  .action(async () => {
    console.log("🧪 Testing property descriptions API...\n");
    
    try {
      // Get one property first using workaround client
      const workaroundClient = new HostfullyClient();
      const allProperties = await workaroundClient.listAllProperties();
      
      if (allProperties.length === 0) {
        console.error("❌ No properties found to test descriptions with");
        return;
      }
      
      const testProperty = allProperties[0];
      console.log(`📋 Testing with property: ${testProperty.uid} - ${testProperty.name || 'Unnamed'}\n`);
      
      // Test different ways to call the descriptions API
      const testCalls = [
        {
          name: "Standard call",
          url: `${ENV.BASE}/property-descriptions`,
          params: { propertyUid: testProperty.uid }
        },
        {
          name: "With agency UID",
          url: `${ENV.BASE}/property-descriptions`,
          params: { propertyUid: testProperty.uid, agencyUid: ENV.AGENCY_UID }
        },
        {
          name: "Path parameter style",
          url: `${ENV.BASE}/property-descriptions/${testProperty.uid}`,
          params: {}
        }
      ];
      
      for (const testCall of testCalls) {
        try {
          console.log(`🧪 Testing: ${testCall.name}`);
          console.log(`   URL: ${testCall.url}`);
          console.log(`   Params:`, testCall.params);
          
          const descResponse = await axios.get(testCall.url, {
            params: testCall.params,
            headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
          });
          
          console.log(`   ✅ Status: ${descResponse.status}`);
          console.log(`   📊 Response type:`, typeof descResponse.data);
          console.log(`   📋 Response:`, JSON.stringify(descResponse.data, null, 2));
          console.log('');
          
        } catch (error: any) {
          console.log(`   ❌ Failed: ${error?.response?.status} - ${error?.response?.statusText}`);
          console.log(`   📋 Error:`, error?.response?.data || error?.message);
          console.log('');
        }
      }
      
    } catch (error: any) {
      console.error("❌ Test failed:", error.message);
    }
  });

program
  .command("test-limits")
  .description("🚀 Test different _limit values to find optimal setting")
  .action(async () => {
    console.log("🧪 Testing different _limit values...\n");
    
    const limits = [50, 100, 150, 200, 300, 500];
    const results: any[] = [];
    
    for (const limit of limits) {
      try {
        console.log(`📡 Testing _limit=${limit}...`);
        
        const response = await axios.get(`${ENV.BASE}/properties`, {
          params: { 
            agencyUid: ENV.AGENCY_UID,
            _limit: limit
          },
          headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
        });
        
        const properties = response.data?.properties || response.data?.data || [];
        results.push({ limit, count: properties.length });
        console.log(`   ✅ _limit=${limit}: Found ${properties.length} properties`);
        
        if (properties.length >= 80) {
          console.log(`   🎉 SUCCESS! Found ${properties.length} properties with _limit=${limit}`);
        }
        
      } catch (error: any) {
        console.log(`   ❌ _limit=${limit} failed: ${error?.response?.status}`);
        results.push({ limit, count: 0, error: true });
      }
    }
    
    console.log(`\n📊 LIMIT TEST RESULTS:`);
    console.log(`═══════════════════════════`);
    results.forEach(result => {
      const status = result.error ? '❌ FAILED' : 
                    result.count >= 80 ? '🎉 EXCELLENT' :
                    result.count >= 50 ? '👍 GOOD' : '⚠️ LIMITED';
      console.log(`_limit=${result.limit.toString().padStart(3)}: ${result.count.toString().padStart(3)} properties ${status}`);
    });
    
    const bestResult = results.filter(r => !r.error).sort((a, b) => b.count - a.count)[0];
    if (bestResult) {
      console.log(`\n💡 Best result: _limit=${bestResult.limit} found ${bestResult.count} properties`);
      console.log(`🚀 Use: npm start export-rest-focused`);
    }
  });

// GraphQL Commands
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
    const client = new GraphQLHostfullyClient();
    if (typeof client.discoverGraphQLSchema === 'function') {
      await client.discoverGraphQLSchema();
    } else {
      console.log("❌ discoverGraphQLSchema method not available on client");
    }
  });

program
  .command("discover-missing")
  .description("🎯 Target discovery for missing property units based on patterns")
  .action(async () => {
    const client = new GraphQLHostfullyClient();
    console.log("🎯 Starting targeted discovery for missing units...\n");
    
    if (typeof client.discoverMissingUnits === 'function') {
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
    } else {
      console.log("❌ discoverMissingUnits method not available on client");
    }
  });

program
  .command("test-high-limit")
  .description("🚀 Test very high limits to bypass pagination entirely")
  .action(async () => {
    console.log("🚀 Testing high limits to bypass pagination...\n");
    
    const client = new GraphQLHostfullyClient();
    
    console.log(`📡 Testing GraphQL with very high limits...`);
    const allProperties = await client.getAllProperties();
    
    console.log(`\n📊 High Limit Test Results: ${allProperties.length} total properties found`);
    
    if (allProperties.length > 23) {
      console.log(`🎉 SUCCESS! Found more than 23 properties!`);
      console.log(`Sample properties:`);
      allProperties.slice(0, 5).forEach((prop: any, i: number) => {
        console.log(`   ${i+1}. ${prop.uid} - ${prop.name}`);
      });
    } else {
      console.log(`⚠️ Still limited to ${allProperties.length} properties`);
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
    
    // Use the HostfullyClient workaround
    const workaroundClient = new HostfullyClient();
    const properties = await workaroundClient.listAllProperties();
    
    console.log(`\n📊 WORKAROUND RESULTS:`);
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
        console.log(`   ${i+1}. ${p.uid} - ${p.name || 'Unnamed'}`);
      });
    }
  });

// Quick list command for debugging
program
  .command("list")
  .description("Quick list of properties for debugging")
  .option("--limit <n>", "Number to show", "20")
  .action(async (opts: any) => {
    const limit = parseInt(opts.limit, 10) || 20;
    
    try {
      const response = await axios.get(`${ENV.BASE}/properties`, {
        params: { 
          agencyUid: ENV.AGENCY_UID,
          _limit: limit  // Use _limit for proper REST API call
        },
        headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
      });
      
      const properties = response.data?.properties || response.data?.data || [];
      
      console.log(`📋 Found ${properties.length} properties:\n`);
      
      properties.forEach((prop: any, i: number) => {
        console.log(`${(i + 1).toString().padStart(2)}. ${prop.uid}`);
        console.log(`    📋 ${prop.name || 'Unnamed'}`);
        console.log(`    ${prop.isActive ? '✅ Active' : '❌ Inactive'}`);
        console.log(`    📍 ${prop.address?.address || 'No address'}`);
        console.log('');
      });
      
    } catch (error: any) {
      console.error("❌ List failed:", error?.response?.status, error.message);
    }
  });

// List all properties using REST API
program
  .command("list-all")
  .description("📋 List ALL properties using REST API")
  .action(async () => {
    console.log("📋 Listing ALL properties using REST API...\n");
    
    try {
      const workaroundClient = new HostfullyClient();
      const properties = await workaroundClient.listAllProperties();
      
      console.log(`🎉 Found ${properties.length} properties total:\n`);
      
      // Group by address for better organization
      const groupedByAddress = properties.reduce((groups: any, prop: any) => {
        const address = prop.address?.address || 'Unknown Address';
        if (!groups[address]) groups[address] = [];
        groups[address].push(prop);
        return groups;
      }, {});
      
      // Display organized by address
      Object.entries(groupedByAddress)
        .sort((a: any, b: any) => b[1].length - a[1].length)
        .forEach(([address, props]: [string, any]) => {
          console.log(`🏠 ${address} (${props.length} units):`);
          props.forEach((prop: any, i: number) => {
            console.log(`   ${(i + 1).toString().padStart(2)}. ${prop.uid}`);
            console.log(`       📋 ${prop.name || 'Unnamed'}`);
            console.log(`       ${prop.isActive ? '✅ Active' : '❌ Inactive'}`);
          });
          console.log('');
        });
      
      console.log(`📊 SUMMARY:`);
      console.log(`Total properties: ${properties.length}`);
      console.log(`Expected: 89 properties`);
      console.log(`Success rate: ${Math.round(properties.length / 89 * 100)}%`);
      
    } catch (error: any) {
      console.error("❌ List all failed:", error?.response?.status, error.message);
    }
  });

// Enhanced discovery command with fallback
program
  .command("discover-all")
  .description("🔬 Advanced property discovery to find all 89 properties") 
  .option("--throttle <ms>", "Delay between API calls (ms)", "1500")
  .action(async (opts: any) => {
    const throttleMs = parseInt(opts.throttle, 10);
    if (Number.isFinite(throttleMs)) {
      process.env.THROTTLE_MS = String(throttleMs);
    }
    
    // Try GraphQL first
    console.log("🔬 Running comprehensive property discovery...\n");
    
    const graphqlClient = new GraphQLHostfullyClient();
    let allProperties = await graphqlClient.getAllProperties();
    
    // If GraphQL doesn't find enough, try workaround client
    if (allProperties.length < 80) {
      console.log(`\n🔄 GraphQL found ${allProperties.length}, trying workaround client...`);
      
      const workaroundClient = new HostfullyClient();
      const workaroundProperties = await workaroundClient.listAllProperties();
      
      // Merge results, avoiding duplicates
      const foundUIDs = new Set(allProperties.map(p => p.uid));
      workaroundProperties.forEach(prop => {
        if (!foundUIDs.has(prop.uid)) {
          // Convert HostfullyProperty to GraphQLProperty format
          const convertedProp = {
            uid: prop.uid,
            name: prop.name || prop.title || '',
            isActive: prop.isActive !== false,
            mainPicture: {},
            businessType: '',
            propertyType: '',
            availability: { maxGuests: prop.maxGuests || prop.availability?.maxGuests || 0 },
            address: {
              address: prop.address?.address || '',
              address2: prop.address?.address2 || '',
              zipCode: prop.address?.zipCode || '',
              city: prop.address?.city || '',
              state: prop.address?.state || ''
            },
            subUnits: [],
            numberOfSubUnits: 0,
            pricing: { currency: 'USD' },
            tags: prop.tags || []
          };
          allProperties.push(convertedProp);
        }
      });
    }
    
    console.log(`\n📊 COMPREHENSIVE DISCOVERY RESULTS:`);
    console.log(`Total properties found: ${allProperties.length}`);
    console.log(`Expected: 89 properties`);
    console.log(`Success rate: ${Math.round(allProperties.length / 89 * 100)}%`);
    
    if (allProperties.length > 50) {
      console.log(`🎉 SUCCESS! Found a substantial number of properties!`);
    } else {
      console.log(`⚠️ Found ${allProperties.length} properties, may need API support`);
    }
  });

program.parse(process.argv);