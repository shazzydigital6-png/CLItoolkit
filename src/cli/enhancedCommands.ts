// src/cli/enhancedCommands.ts - Fixed version with proper method calls

import * as fs from "fs";
import * as path from "path";
import { stringify } from "csv-stringify/sync";
import axios from "axios";
import { HostfullyClient, HostfullyProperty } from "../api/hostfullyClient";
import { ENV } from "../utils/env";

export interface ExportOptions {
  outputDir?: string;
  includeDescriptions?: boolean;
  includePricing?: boolean;
  includeAmenities?: boolean;
  format?: 'csv' | 'json' | 'both';
  validate?: boolean;
}

export class EnhancedPropertyManager {
  private client: HostfullyClient;
  
  constructor() {
    this.client = new HostfullyClient();
  }

  /**
   * Test different limits to find optimal value
   */
  async findOptimalLimit(): Promise<{ limit: number; count: number }> {
    console.log("Testing different limit values to find optimal...");
    
    const testLimits = [500, 300, 250, 200, 150, 100];
    let bestResult = { limit: 100, count: 0 };
    
    for (const limit of testLimits) {
      try {
        console.log(`Testing _limit=${limit}...`);
        
        const response = await axios.get(`${ENV.BASE}/properties`, {
          params: { 
            agencyUid: ENV.AGENCY_UID,
            _limit: limit,
            includeArchived: true
          },
          headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
        });
        
        const properties = response.data?.properties || response.data?.data || [];
        const count = properties.length;
        
        console.log(`   _limit=${limit}: ${count} properties`);
        
        if (count > bestResult.count) {
          bestResult = { limit, count };
          console.log(`   New best: ${count} properties`);
        }
        
        // If we got 89+ properties, this is likely optimal
        if (count >= 89) {
          console.log(`   Found all expected properties!`);
          break;
        }
        
      } catch (error: any) {
        console.log(`   _limit=${limit} failed: ${error?.response?.status}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
    }
    
    console.log(`Optimal limit found: _limit=${bestResult.limit} returns ${bestResult.count} properties`);
    return bestResult;
  }

  /**
   * Get performance stats for API calls
   */
  async getPerformanceStats() {
    const startTime = Date.now();
    
    try {
      const properties = await this.client.listAllProperties();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      return {
        success: true,
        propertiesFound: properties.length,
        durationMs: duration,
        averagePerProperty: Math.round(duration / Math.max(properties.length, 1))
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message,
        durationMs: Date.now() - startTime,
        propertiesFound: 0,
        averagePerProperty: 0
      };
    }
  }

  /**
   * Verify we can get all 89 properties and show summary
   */
  async verifyFullAccess(): Promise<void> {
    console.log("VERIFYING FULL PROPERTY ACCESS");
    console.log("=".repeat(50));
    
    try {
      // Test optimal limit finding
      console.log("1. Finding optimal limit...");
      const optimal = await this.findOptimalLimit();
      
      // Get performance stats
      console.log("\n2. Testing performance...");
      const stats = await this.getPerformanceStats();
      
      console.log(`\nVERIFICATION RESULTS:`);
      console.log(`Optimal limit: ${optimal.limit}`);
      console.log(`Properties found: ${optimal.count}/89`);
      console.log(`Request duration: ${stats.durationMs}ms`);
      console.log(`Average per property: ${stats.averagePerProperty}ms`);
      
      if (optimal.count >= 89) {
        console.log(`\nSUCCESS! Full access to all properties confirmed!`);
      } else {
        console.log(`\nWarning: Only found ${optimal.count}/89 properties`);
        console.log(`Consider running investigate command for missing properties`);
      }

      // Quick validation of property data quality
      console.log("\n3. Validating property data quality...");
      await this.validatePropertyData();
      
    } catch (error: any) {
      console.error("Verification failed:", error?.message);
      throw error;
    }
  }

  /**
   * Export all 89 properties with comprehensive data
   */
  async exportAllProperties(options: ExportOptions = {}): Promise<string[]> {
    const {
      outputDir = "./exports",
      includeDescriptions = true,
      includePricing = false,
      includeAmenities = false,
      format = 'csv',
      validate = true
    } = options;

    console.log("COMPREHENSIVE PROPERTY EXPORT");
    console.log("=".repeat(50));
    console.log(`Output: ${outputDir}`);
    console.log(`Include descriptions: ${includeDescriptions}`);
    console.log(`Include pricing: ${includePricing}`);
    console.log(`Include amenities: ${includeAmenities}`);
    console.log(`Format: ${format}`);
    
    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Step 1: Get all properties
    console.log("\n1. Fetching all properties...");
    const allProperties = await this.client.listAllProperties();
    console.log(`Retrieved ${allProperties.length} properties`);
    
    if (validate && allProperties.length < 85) {
      console.warn(`Warning: Expected ~89 properties but got ${allProperties.length}`);
    }

    // Step 2: Enhance with additional data
    const enhancedProperties = await this.enhanceProperties(allProperties, {
      includeDescriptions,
      includePricing,
      includeAmenities
    });

    // Step 3: Generate exports
    const timestamp = new Date().toISOString().split('T')[0];
    const outputFiles: string[] = [];

    if (format === 'csv' || format === 'both') {
      const csvFile = await this.generateCSV(enhancedProperties, outputDir, timestamp);
      outputFiles.push(csvFile);
    }

    if (format === 'json' || format === 'both') {
      const jsonFile = await this.generateJSON(enhancedProperties, outputDir, timestamp);
      outputFiles.push(jsonFile);
    }

    // Step 4: Generate summary report
    const summaryFile = await this.generateSummaryReport(enhancedProperties, outputDir, timestamp);
    outputFiles.push(summaryFile);

    console.log(`\nEXPORT COMPLETE!`);
    console.log(`Files created: ${outputFiles.length}`);
    outputFiles.forEach(file => console.log(`   ${file}`));
    
    return outputFiles;
  }

  /**
   * Enhance properties with additional data
   */
  private async enhanceProperties(
    properties: HostfullyProperty[], 
    options: { includeDescriptions: boolean; includePricing: boolean; includeAmenities: boolean }
  ): Promise<any[]> {
    console.log("\n2. Enhancing property data...");
    
    const enhanced = [];
    const { includeDescriptions, includePricing, includeAmenities } = options;
    
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const enhancedProperty: any = { ...property };
      
      try {
        // Add descriptions if requested
        if (includeDescriptions) {
          const descriptions = await this.fetchPropertyDescriptions(property.uid);
          enhancedProperty.descriptions = descriptions;
        }

        // Add detailed info if requested
        if (includePricing || includeAmenities) {
          const details = await this.client.getPropertyByUid(property.uid);
          if (details) {
            if (includePricing) enhancedProperty.pricingDetails = details.pricing || {};
            if (includeAmenities) enhancedProperty.amenitiesDetails = details.amenities || [];
          }
        }

        enhanced.push(enhancedProperty);

        // Progress indicator
        if ((i + 1) % 10 === 0 || i === properties.length - 1) {
          console.log(`   Enhanced ${i + 1}/${properties.length} properties`);
        }

      } catch (error: any) {
        console.warn(`   Failed to enhance ${property.uid}: ${error?.message}`);
        enhanced.push(enhancedProperty); // Add without enhancements
      }

      // Rate limiting
      if (i < properties.length - 1) {
        await new Promise(resolve => setTimeout(resolve, ENV.THROTTLE_MS || 200));
      }
    }

    console.log(`Enhanced ${enhanced.length} properties`);
    return enhanced;
  }

  /**
   * Fetch property descriptions using working API approach
   */
  private async fetchPropertyDescriptions(propertyUid: string): Promise<any> {
    try {
      const response = await axios.get(`${ENV.BASE}/property-descriptions`, {
        params: { 
          propertyUid,
          agencyUid: ENV.AGENCY_UID
        },
        headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY },
        timeout: 10000
      });

      const descriptionsArray = response.data?.propertyDescriptions || [];
      
      if (descriptionsArray.length > 0) {
        const desc = descriptionsArray[0];
        return {
          public_name: desc.name || '',
          short_description: desc.shortSummary || '',
          long_description: desc.summary || '',
          notes: desc.notes || '',
          interaction: desc.interaction || '',
          neighbourhood: desc.neighbourhood || '',
          space: desc.space || '',
          access: desc.access || '',
          transit: desc.transit || '',
          house_manual: desc.houseManual || '',
          locale: desc.locale || 'en_US'
        };
      }

      return {};
    } catch (error: any) {
      console.warn(`Failed to fetch descriptions for ${propertyUid}: ${error?.response?.status}`);
      return {};
    }
  }

  /**
   * Generate comprehensive CSV export
   */
  private async generateCSV(properties: any[], outputDir: string, timestamp: string): Promise<string> {
    console.log("\n3. Generating CSV export...");

    const csvData = properties.map((property, index) => {
      const row: any = {
        // Core property data
        row_number: index + 1,
        uid: property.uid,
        name: property.name || property.title || '',
        status: property.isActive ? 'Active' : 'Inactive',
        
        // Location data
        address: property.address?.address || '',
        address_2: property.address?.address2 || '',
        city: property.address?.city || '',
        state: property.address?.state || '',
        zip_code: property.address?.zipCode || '',
        country: property.address?.countryCode || '',
        latitude: property.address?.latitude || '',
        longitude: property.address?.longitude || '',
        
        // Capacity
        max_guests: property.availability?.maxGuests || property.maxGuests || '',
        bedrooms: property.bedrooms || '',
        bathrooms: property.bathrooms || '',
        
        // Tags and categories
        tags: JSON.stringify(property.tags || []),
        property_type: property.propertyType || '',
        business_type: property.businessType || '',
        
        // Export metadata
        export_timestamp: new Date().toISOString(),
        data_source: 'Hostfully API'
      };

      // Add description fields if available
      if (property.descriptions) {
        const desc = property.descriptions;
        row.description_public_name = desc.public_name || '';
        row.description_short = desc.short_description || '';
        row.description_long = desc.long_description || '';
        row.description_notes = desc.notes || '';
        row.description_interaction = desc.interaction || '';
        row.description_neighbourhood = desc.neighbourhood || '';
        row.description_space = desc.space || '';
        row.description_access = desc.access || '';
        row.description_transit = desc.transit || '';
        row.description_house_manual = desc.house_manual || '';
        row.description_locale = desc.locale || '';
        
        // Character counts
        row.desc_public_name_chars = (desc.public_name || '').length;
        row.desc_short_chars = (desc.short_description || '').length;
        row.desc_long_chars = (desc.long_description || '').length;
      }

      return row;
    });

    const filename = `hostfully_all_properties_${timestamp}.csv`;
    const filepath = path.join(outputDir, filename);
    
    const csvContent = stringify(csvData, { 
      header: true,
      quoted: true
    });
    
    fs.writeFileSync(filepath, csvContent, 'utf8');
    
    const fileSize = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);
    console.log(`CSV exported: ${filepath} (${fileSize} MB)`);
    
    return filepath;
  }

  /**
   * Generate JSON export
   */
  private async generateJSON(properties: any[], outputDir: string, timestamp: string): Promise<string> {
    console.log("\nGenerating JSON export...");

    const jsonData = {
      export_info: {
        timestamp: new Date().toISOString(),
        total_properties: properties.length,
        data_source: 'Hostfully API',
        api_endpoint: ENV.BASE,
        agency_uid: ENV.AGENCY_UID
      },
      properties: properties.map((property, index) => ({
        index: index + 1,
        ...property
      }))
    };

    const filename = `hostfully_all_properties_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2), 'utf8');
    
    const fileSize = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2);
    console.log(`JSON exported: ${filepath} (${fileSize} MB)`);
    
    return filepath;
  }

  /**
   * Generate summary report
   */
  private async generateSummaryReport(properties: any[], outputDir: string, timestamp: string): Promise<string> {
    console.log("\nGenerating summary report...");

    // Analyze the data
    const activeCount = properties.filter(p => p.isActive).length;
    const inactiveCount = properties.length - activeCount;
    
    const cities = new Map();
    const states = new Map();
    const propertyTypes = new Map();
    
    properties.forEach(property => {
      const city = property.address?.city || 'Unknown';
      const state = property.address?.state || 'Unknown';
      const type = property.propertyType || 'Unknown';
      
      cities.set(city, (cities.get(city) || 0) + 1);
      states.set(state, (states.get(state) || 0) + 1);
      propertyTypes.set(type, (propertyTypes.get(type) || 0) + 1);
    });

    const withDescriptions = properties.filter(p => p.descriptions && Object.keys(p.descriptions).length > 0).length;

    const report = `# Hostfully Property Export Summary

## Export Information
- **Export Date**: ${new Date().toISOString()}
- **Total Properties**: ${properties.length}
- **Expected Count**: 89
- **Success Rate**: ${Math.round(properties.length / 89 * 100)}%

## Property Status
- **Active Properties**: ${activeCount} (${Math.round(activeCount / properties.length * 100)}%)
- **Inactive Properties**: ${inactiveCount} (${Math.round(inactiveCount / properties.length * 100)}%)

## Geographic Distribution
### By State
${Array.from(states.entries())
  .sort((a, b) => b[1] - a[1])
  .map(([state, count]) => `- **${state}**: ${count} properties`)
  .join('\n')}

### By City (Top 10)
${Array.from(cities.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([city, count]) => `- **${city}**: ${count} properties`)
  .join('\n')}

## Property Types
${Array.from(propertyTypes.entries())
  .sort((a, b) => b[1] - a[1])
  .map(([type, count]) => `- **${type}**: ${count} properties`)
  .join('\n')}

## Data Quality
- **Properties with Descriptions**: ${withDescriptions}/${properties.length} (${Math.round(withDescriptions / properties.length * 100)}%)
- **Properties with Addresses**: ${properties.filter(p => p.address?.address).length}/${properties.length}
- **Properties with Coordinates**: ${properties.filter(p => p.address?.latitude && p.address?.longitude).length}/${properties.length}

## Sample Properties
${properties.slice(0, 5).map((p, i) => 
  `${i + 1}. **${p.name || 'Unnamed'}** (${p.uid})\n   - Status: ${p.isActive ? 'Active' : 'Inactive'}\n   - Location: ${p.address?.city || 'Unknown'}, ${p.address?.state || 'Unknown'}`
).join('\n\n')}

---
*Generated by Hostfully Property Export Tool*
`;

    const filename = `hostfully_export_summary_${timestamp}.md`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, report, 'utf8');
    console.log(`Summary report: ${filepath}`);
    
    return filepath;
  }

  /**
   * Validate property data quality
   */
  private async validatePropertyData(): Promise<void> {
    try {
      const properties = await this.client.listAllProperties();
      
      const validation = {
        total: properties.length,
        withNames: properties.filter(p => p.name || p.title).length,
        withAddresses: properties.filter(p => p.address?.address).length,
        withCities: properties.filter(p => p.address?.city).length,
        withStates: properties.filter(p => p.address?.state).length,
        active: properties.filter(p => p.isActive).length,
        withMaxGuests: properties.filter(p => p.availability?.maxGuests || p.maxGuests).length,
      };

      console.log(`Data Quality Report:`);
      console.log(`   Total properties: ${validation.total}`);
      console.log(`   With names: ${validation.withNames}/${validation.total} (${Math.round(validation.withNames/validation.total*100)}%)`);
      console.log(`   With addresses: ${validation.withAddresses}/${validation.total} (${Math.round(validation.withAddresses/validation.total*100)}%)`);
      console.log(`   With cities: ${validation.withCities}/${validation.total} (${Math.round(validation.withCities/validation.total*100)}%)`);
      console.log(`   Active status: ${validation.active}/${validation.total} (${Math.round(validation.active/validation.total*100)}%)`);
      console.log(`   With max guests: ${validation.withMaxGuests}/${validation.total} (${Math.round(validation.withMaxGuests/validation.total*100)}%)`);
      
      // Check for potential data issues
      const issues = [];
      if (validation.withNames < validation.total * 0.9) {
        issues.push("Many properties missing names");
      }
      if (validation.withAddresses < validation.total * 0.8) {
        issues.push("Many properties missing addresses");
      }
      if (validation.active < validation.total * 0.3) {
        issues.push("Low percentage of active properties");
      }
      
      if (issues.length > 0) {
        console.log(`Data quality issues detected:`);
        issues.forEach(issue => console.log(`   - ${issue}`));
      } else {
        console.log(`Data quality looks good!`);
      }
      
    } catch (error: any) {
      console.error("Data validation failed:", error?.message);
    }
  }

  /**
   * Quick analytics on all properties
   */
  async generateQuickAnalytics(): Promise<void> {
    console.log("QUICK PROPERTY ANALYTICS");
    console.log("=".repeat(50));
    
    const properties = await this.client.listAllProperties();
    
    // Basic stats
    console.log(`Basic Statistics:`);
    console.log(`   Total Properties: ${properties.length}`);
    console.log(`   Active: ${properties.filter(p => p.isActive).length}`);
    console.log(`   Inactive: ${properties.filter(p => !p.isActive).length}`);
    
    // Location analysis
    const locationStats = this.analyzeLocations(properties);
    console.log(`\nLocation Analysis:`);
    console.log(`   States: ${locationStats.states.size}`);
    console.log(`   Cities: ${locationStats.cities.size}`);
    console.log(`   Top state: ${locationStats.topState.name} (${locationStats.topState.count} properties)`);
    console.log(`   Top city: ${locationStats.topCity.name} (${locationStats.topCity.count} properties)`);
    
    // Capacity analysis
    const capacityStats = this.analyzeCapacity(properties);
    console.log(`\nCapacity Analysis:`);
    console.log(`   Average max guests: ${capacityStats.averageGuests}`);
    console.log(`   Largest property: ${capacityStats.maxGuests} guests`);
    console.log(`   Smallest property: ${capacityStats.minGuests} guests`);
    console.log(`   Properties with guest info: ${capacityStats.withGuestInfo}/${properties.length}`);
    
    // Naming patterns
    const namingStats = this.analyzeNaming(properties);
    console.log(`\nNaming Patterns:`);
    console.log(`   Properties with names: ${namingStats.withNames}/${properties.length}`);
    console.log(`   Common prefixes: ${namingStats.commonPrefixes.slice(0, 3).map(p => `"${p.prefix}" (${p.count})`).join(', ')}`);
    console.log(`   Average name length: ${namingStats.averageLength} characters`);
  }

  private analyzeLocations(properties: HostfullyProperty[]) {
    const states = new Map<string, number>();
    const cities = new Map<string, number>();
    
    properties.forEach(property => {
      const state = property.address?.state || 'Unknown';
      const city = property.address?.city || 'Unknown';
      
      states.set(state, (states.get(state) || 0) + 1);
      cities.set(city, (cities.get(city) || 0) + 1);
    });
    
    const sortedStates = Array.from(states.entries()).sort((a, b) => b[1] - a[1]);
    const sortedCities = Array.from(cities.entries()).sort((a, b) => b[1] - a[1]);
    
    return {
      states,
      cities,
      topState: { name: sortedStates[0]?.[0] || 'Unknown', count: sortedStates[0]?.[1] || 0 },
      topCity: { name: sortedCities[0]?.[0] || 'Unknown', count: sortedCities[0]?.[1] || 0 }
    };
  }

  private analyzeCapacity(properties: HostfullyProperty[]) {
    const guestCounts = properties
      .map(p => p.availability?.maxGuests || p.maxGuests || 0)
      .filter(count => count > 0);
    
    const averageGuests = guestCounts.length > 0 
      ? Math.round(guestCounts.reduce((sum, count) => sum + count, 0) / guestCounts.length)
      : 0;
    
    return {
      averageGuests,
      maxGuests: Math.max(...guestCounts, 0),
      minGuests: Math.min(...guestCounts, 0),
      withGuestInfo: guestCounts.length
    };
  }

  private analyzeNaming(properties: HostfullyProperty[]) {
    const namesWithData = properties
      .map(p => p.name || p.title)
      .filter(name => name && name.trim().length > 0);
    
    const prefixes = new Map<string, number>();
    let totalLength = 0;
    
    namesWithData.forEach(name => {
      totalLength += name.length;
      
      // Extract potential prefix patterns (first word or number pattern)
      const firstWord = name.split(/[\s-]/).filter(Boolean)[0];
      if (firstWord && firstWord.length >= 2) {
        const prefix = firstWord.length > 10 ? firstWord.substring(0, 10) : firstWord;
        prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
      }
    });
    
    const commonPrefixes = Array.from(prefixes.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([prefix, count]) => ({ prefix, count }));
    
    return {
      withNames: namesWithData.length,
      averageLength: namesWithData.length > 0 ? Math.round(totalLength / namesWithData.length) : 0,
      commonPrefixes
    };
  }

  /**
   * Export properties in a specific format optimized for external tools
   */
  async exportForExternalTool(tool: 'airtable' | 'notion' | 'excel' | 'google-sheets', outputDir: string = './exports'): Promise<string> {
    console.log(`Exporting for ${tool.toUpperCase()}...`);
    
    const properties = await this.client.listAllProperties();
    
    // Tool-specific field mappings and formatting
    const toolConfigs = {
      airtable: {
        maxFieldName: 100,
        dateFormat: 'ISO',
        arrayFormat: 'comma-separated',
        filename: `airtable_import_${Date.now()}.csv`
      },
      notion: {
        maxFieldName: 100,
        dateFormat: 'ISO',
        arrayFormat: 'comma-separated',
        filename: `notion_import_${Date.now()}.csv`
      },
      excel: {
        maxFieldName: 255,
        dateFormat: 'MM/DD/YYYY',
        arrayFormat: 'semicolon-separated',
        filename: `excel_import_${Date.now()}.csv`
      },
      'google-sheets': {
        maxFieldName: 256,
        dateFormat: 'MM/DD/YYYY',
        arrayFormat: 'comma-separated',
        filename: `google_sheets_import_${Date.now()}.csv`
      }
    };
    
    const config = toolConfigs[tool];
    
    // Format data according to tool requirements
    const formattedData = properties.map((property, index) => ({
      // Clean field names for compatibility
      'Property ID': property.uid,
      'Property Name': property.name || property.title || `Property ${index + 1}`,
      'Status': property.isActive ? 'Active' : 'Inactive',
      'Street Address': property.address?.address || '',
      'City': property.address?.city || '',
      'State': property.address?.state || '',
      'ZIP Code': property.address?.zipCode || '',
      'Country': property.address?.countryCode || 'US',
      'Latitude': property.address?.latitude || '',
      'Longitude': property.address?.longitude || '',
      'Max Guests': property.availability?.maxGuests || property.maxGuests || '',
      'Property Type': property.propertyType || '',
      'Business Type': property.businessType || '',
      'Tags': this.formatArrayForTool(property.tags || [], config.arrayFormat),
      'Last Updated': new Date().toLocaleDateString(),
      'Data Source': 'Hostfully API'
    }));
    
    fs.mkdirSync(outputDir, { recursive: true });
    const filepath = path.join(outputDir, config.filename);
    
    const csvContent = stringify(formattedData, { 
      header: true,
      quoted: true 
    });
    
    fs.writeFileSync(filepath, csvContent, 'utf8');
    
    console.log(`${tool.toUpperCase()} export created: ${filepath}`);
    console.log(`${formattedData.length} properties exported`);
    
    // Generate tool-specific import instructions
    this.generateImportInstructions(tool, filepath);
    
    return filepath;
  }

  private formatArrayForTool(array: any[], format: string): string {
    if (!Array.isArray(array) || array.length === 0) return '';
    
    const separator = format === 'comma-separated' ? ', ' : 
                     format === 'semicolon-separated' ? '; ' : ', ';
    
    return array.filter(Boolean).join(separator);
  }

  private generateImportInstructions(tool: string, filepath: string): void {
    const instructions = {
      airtable: `
AIRTABLE IMPORT INSTRUCTIONS:
1. Open your Airtable base
2. Click "Create" → "Import data" → "CSV file"
3. Upload: ${filepath}
4. Review field types (set Status as Single select, Tags as Multiple select)
5. Click "Import data"`,
      
      notion: `
NOTION IMPORT INSTRUCTIONS:
1. Open your Notion workspace
2. Create a new database or open existing one
3. Click "⋯" → "Merge with CSV"
4. Upload: ${filepath}
5. Map columns to properties
6. Click "Import"`,
      
      excel: `
EXCEL IMPORT INSTRUCTIONS:
1. Open Microsoft Excel
2. Go to Data → "From Text/CSV"
3. Select: ${filepath}
4. Choose "Delimited" and "UTF-8" encoding
5. Click "Load"`,
      
      'google-sheets': `
GOOGLE SHEETS IMPORT INSTRUCTIONS:
1. Open Google Sheets
2. File → Import → Upload
3. Select: ${filepath}
4. Choose "Replace current sheet" or "Create new sheet"
5. Click "Import data"`
    };
    
    console.log(instructions[tool as keyof typeof instructions] || '');
  }
}

// Export functions for CLI integration
export async function verifyFullPropertyAccess(): Promise<void> {
  const manager = new EnhancedPropertyManager();
  await manager.verifyFullAccess();
}

export async function exportAllPropertiesEnhanced(options: ExportOptions = {}): Promise<string[]> {
  const manager = new EnhancedPropertyManager();
  return await manager.exportAllProperties(options);
}

export async function generatePropertyAnalytics(): Promise<void> {
  const manager = new EnhancedPropertyManager();
  await manager.generateQuickAnalytics();
}

export async function exportForTool(tool: 'airtable' | 'notion' | 'excel' | 'google-sheets', outputDir?: string): Promise<string> {
  const manager = new EnhancedPropertyManager();
  return await manager.exportForExternalTool(tool, outputDir);
}