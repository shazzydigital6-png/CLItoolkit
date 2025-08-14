// src/cli/graphqlCommands.ts
import * as fs from "fs";
import * as path from "path";
import { stringify } from "csv-stringify/sync";
import { parse } from "csv-parse/sync";
import { GraphQLHostfullyClient, GraphQLProperty } from "../api/graphqlHostfullyClient";

export async function testGraphQLAccess(authToken?: string): Promise<void> {
  console.log("🧪 Testing GraphQL access...\n");
  
  const client = new GraphQLHostfullyClient(authToken);
  const hasAccess = await client.testAccess();
  
  if (hasAccess) {
    console.log("🎉 SUCCESS! GraphQL endpoint is working");
    console.log("You can now use all GraphQL-based commands");
  } else {
    console.log("❌ GraphQL access failed");
    console.log("You may need to provide a valid JWT token");
    console.log("Try: npm start graphql-test --token YOUR_JWT_TOKEN");
  }
}

export async function exportAllPropertiesGraphQL(outputDir: string = "./exports"): Promise<GraphQLProperty[]> {
  console.log("📂 Exporting ALL properties via GraphQL...\n");
  
  const client = new GraphQLHostfullyClient();
  
  try {
    const properties = await client.getAllProperties();
    
    console.log(`✅ Retrieved ${properties.length} properties from GraphQL API`);
    
    // Convert to CSV format
    const now = new Date().toISOString();
    const csvData = properties.map((p: GraphQLProperty) => ({
      listing_id: p.uid,
      platform_status: p.isActive ? "active" : "inactive",
      title: p.name || "",
      business_type: p.businessType || "",
      property_type: p.propertyType || "",
      bedrooms: null, // Not available in this GraphQL schema
      bathrooms: null, // Not available in this GraphQL schema
      max_guests: p.availability?.maxGuests || null,
      address_full: p.address?.address || "",
      address_2: p.address?.address2 || "",
      city: p.address?.city || "",
      state: p.address?.state || "",
      zip_code: p.address?.zipCode || "",
      has_sub_units: p.numberOfSubUnits > 0,
      sub_units_count: p.numberOfSubUnits,
      currency: p.pricing?.currency || "USD",
      tags: JSON.stringify(p.tags || []),
      tiny_thumbnail: p.mainPicture?.tinyThumbnail || "",
      large_thumbnail: p.mainPicture?.largeThumbnail || "",
      picture_url: "", // Not available in this GraphQL schema
      master_unit_uid: "", // Not available in this GraphQL schema
      last_synced_at: now,
    }));
    
    // Save to CSV
    const timestamp = now.replace(/[:.]/g, "-");
    const filename = `hostfully_graphql_export_${timestamp}.csv`;
    const filepath = path.join(outputDir, filename);
    
    // Ensure directory exists
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filepath, stringify(csvData, { header: true }), "utf8");
    
    console.log(`\n✅ Exported ${properties.length} properties to: ${filepath}`);
    
    // Show summary
    const activeCount = properties.filter(p => p.isActive).length;
    const inactiveCount = properties.length - activeCount;
    const withSubUnits = properties.filter(p => p.numberOfSubUnits > 0).length;
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total Properties: ${properties.length}`);
    console.log(`   Active: ${activeCount}`);
    console.log(`   Inactive: ${inactiveCount}`);
    console.log(`   With Sub-units: ${withSubUnits}`);
    
    return properties;
    
  } catch (error: any) {
    console.error("❌ GraphQL export failed:", error?.message || error);
    throw error;
  }
}

export async function generateGraphQLUpdateTemplate(outputPath: string = "./graphql_update_template.csv"): Promise<string> {
  console.log("📝 Generating GraphQL bulk update template...\n");
  
  const client = new GraphQLHostfullyClient();
  
  try {
    const properties = await client.getAllProperties();
    
    if (properties.length === 0) {
      console.log("⚠️ No properties found to create template");
      return outputPath;
    }
    
    // Create template with first 3 properties as examples
    const templateProperties = properties.slice(0, Math.min(3, properties.length));
    const template = templateProperties.map((p: GraphQLProperty) => ({
      uid: p.uid,
      name: p.name,
      isActive: p.isActive,
      maxGuests: p.availability?.maxGuests || '',
      // Add more fields as needed for updates
      new_name: '', // User fills this
      new_maxGuests: '', // User fills this
      new_isActive: '', // User fills this
    }));
    
    // Add example row
    template.push({
      uid: 'EXAMPLE_UID',
      name: 'Current Name',
      isActive: true,
      maxGuests: 4,
      new_name: 'Updated Property Name',
      new_maxGuests: '6',
      new_isActive: 'false',
    });
    
    // Ensure output directory exists (only if not current directory)
    const outputDir = path.dirname(outputPath);
    if (outputDir !== '.' && outputDir !== '') {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, stringify(template, { header: true }));
    console.log(`✅ Template created: ${outputPath}`);
    console.log(`\n📝 Instructions:`);
    console.log(`1. Fill in the 'new_*' columns with your desired changes`);
    console.log(`2. Leave 'new_*' fields empty if no change needed`);
    console.log(`3. Remove the EXAMPLE_UID row`);
    console.log(`4. Run: npm start graphql-bulk-update ${outputPath}`);
    
    return outputPath;
    
  } catch (error: any) {
    console.error("❌ Failed to generate template:", error?.message || error);
    throw error;
  }
}

interface BulkUpdateRecord {
  uid: string;
  [key: string]: any;
}

interface BulkUpdateResult {
  successful: number;
  failed: number;
}

export async function bulkUpdateFromGraphQLCSV(
  csvFilePath: string, 
  backupDir?: string
): Promise<BulkUpdateResult | undefined> {
  console.log(`📂 Loading GraphQL bulk updates from: ${csvFilePath}\n`);
  
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    return;
  }
  
  const client = new GraphQLHostfullyClient();
  
  try {
    // Parse CSV
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const records: BulkUpdateRecord[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    console.log(`📊 Loaded ${records.length} update records from CSV`);
    
    // Process updates
    const updates: Array<{uid: string; data: Record<string, any>}> = [];
    
    for (const record of records) {
      if (!record.uid || record.uid === 'EXAMPLE_UID') continue;
      
      const updateData: Record<string, any> = {};
      
      // Map CSV columns to update data
      Object.keys(record).forEach(key => {
        if (key.startsWith('new_') && record[key] && record[key] !== '') {
          const fieldName = key.replace('new_', '');
          let value = record[key];
          
          // Type conversions
          if (fieldName === 'isActive') {
            value = value.toLowerCase() === 'true';
          } else if (fieldName === 'maxGuests') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              value = parsed;
            }
          }
          
          updateData[fieldName] = value;
        }
      });
      
      if (Object.keys(updateData).length > 0) {
        updates.push({ uid: record.uid, data: updateData });
      }
    }
    
    if (updates.length === 0) {
      console.log("❌ No valid updates found in CSV");
      return { successful: 0, failed: 0 };
    }
    
    console.log(`📋 Found ${updates.length} properties to update`);
    console.log(`\nSample update:`, JSON.stringify(updates[0], null, 2));
    
    // Create backup if requested
    if (backupDir) {
      console.log(`\n💾 Creating backup...`);
      const uids = updates.map(u => u.uid);
      const allProperties = await client.getAllProperties();
      const backupProperties = allProperties.filter(p => uids.includes(p.uid));
      
      const backupFile = path.join(backupDir, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(backupFile, JSON.stringify(backupProperties, null, 2));
      console.log(`💾 Backup saved: ${backupFile}`);
    }
    
    // Perform bulk update
    const result = await client.bulkUpdateProperties(updates);
    
    // Save results
    const resultsDir = "./results";
    fs.mkdirSync(resultsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(resultsDir, `graphql_bulk_update_results_${timestamp}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(result, null, 2));
    
    console.log(`\n📊 Results saved to: ${resultsFile}`);
    
    return result;
    
  } catch (error: any) {
    console.error("❌ Bulk update failed:", error?.message || error);
    throw error;
  }
}

export async function listPropertiesSummary(): Promise<GraphQLProperty[]> {
  console.log("📋 Fetching properties summary via GraphQL...\n");
  
  const client = new GraphQLHostfullyClient();
  
  try {
    const properties = await client.getAllProperties();
    
    console.log(`\n📊 PROPERTIES SUMMARY (${properties.length} total)`);
    console.log("═".repeat(60));
    
    properties.forEach((property, index) => {
      const status = property.isActive ? "🟢 ACTIVE" : "🔴 INACTIVE";
      const subUnits = property.numberOfSubUnits > 0 ? ` (+${property.numberOfSubUnits} sub-units)` : "";
      
      console.log(`${(index + 1).toString().padStart(2)}. ${property.name}`);
      console.log(`    UID: ${property.uid}`);
      console.log(`    Status: ${status}`);
      console.log(`    Type: ${property.propertyType} | Guests: ${property.availability?.maxGuests}${subUnits}`);
      console.log(`    Address: ${property.address?.address}, ${property.address?.city}, ${property.address?.state}`);
      console.log("");
    });
    
    // Summary stats
    const stats = {
      total: properties.length,
      active: properties.filter(p => p.isActive).length,
      inactive: properties.filter(p => !p.isActive).length,
      withSubUnits: properties.filter(p => p.numberOfSubUnits > 0).length,
      byType: {} as Record<string, number>
    };
    
    properties.forEach(p => {
      const type = p.propertyType || 'Unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });
    
    console.log("📈 STATISTICS");
    console.log("═".repeat(30));
    console.log(`Total Properties: ${stats.total}`);
    console.log(`Active: ${stats.active} | Inactive: ${stats.inactive}`);
    console.log(`With Sub-units: ${stats.withSubUnits}`);
    console.log(`\nBy Type:`);
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    return properties;
    
  } catch (error: any) {
    console.error("❌ Failed to fetch properties:", error?.message || error);
    throw error;
  }
}