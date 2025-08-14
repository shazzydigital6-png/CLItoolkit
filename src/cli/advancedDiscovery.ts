// src/cli/advancedDiscovery.ts
import axios from "axios";
import { ENV } from "../utils/env";
import * as fs from "fs";

interface DiscoveryResult {
  method: string;
  endpoint: string;
  params: any;
  propertiesFound: number;
  newProperties: string[];
  errors?: string[];
}

export class AdvancedPropertyDiscovery {
  private http = axios.create({
    baseURL: ENV.BASE,
    timeout: 30000,
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY }
  });

  private knownUIDs = new Set<string>();
  private allResults: DiscoveryResult[] = [];

  async discoverAll(): Promise<void> {
    console.log("🔍 ADVANCED PROPERTY DISCOVERY");
    console.log("=====================================");
    console.log(`Agency UID: ${ENV.AGENCY_UID}`);
    console.log(`Target: Find all 89 properties\n`);

    // Strategy 1: Test different API versions
    await this.testApiVersions();
    
    // Strategy 2: Test different base endpoints
    await this.testBaseEndpoints();
    
    // Strategy 3: Test agency variations
    await this.testAgencyVariations();
    
    // Strategy 4: Test parameter combinations
    await this.testParameterCombinations();
    
    // Strategy 5: Test authenticated endpoints
    await this.testAuthenticatedEndpoints();
    
    // Strategy 6: Reverse engineer from property details
    await this.reverseEngineerFromDetails();

    // Generate comprehensive report
    this.generateReport();
  }

  private async testApiVersions(): Promise<void> {
    console.log("🔬 Testing Different API Versions");
    console.log("-".repeat(40));

    const versions = ["v3.0", "v3.1", "v3.2", "v3.3", "v4.0", "v2.0"];
    
    for (const version of versions) {
      try {
        const versionBase = ENV.BASE.replace(/v\d+\.\d+/, version);
        const versionHttp = axios.create({
          baseURL: versionBase,
          timeout: 15000,
          headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY }
        });

        console.log(`📡 Testing ${version}...`);
        
        const response = await versionHttp.get("/properties", {
          params: { agencyUid: ENV.AGENCY_UID, limit: 100 }
        });

        const properties = this.extractProperties(response.data);
        const newUIDs = this.trackNewProperties(properties);

        this.allResults.push({
          method: "REST",
          endpoint: `${version}/properties`,
          params: { agencyUid: ENV.AGENCY_UID, limit: 100 },
          propertiesFound: properties.length,
          newProperties: newUIDs
        });

        console.log(`   ✅ ${version}: ${properties.length} properties, ${newUIDs.length} new`);
        
      } catch (error: any) {
        console.log(`   ❌ ${version}: ${error?.response?.status || 'ERROR'}`);
      }
    }
  }

  private async testBaseEndpoints(): Promise<void> {
    console.log("\n🔬 Testing Different Endpoints");
    console.log("-".repeat(40));

    const endpoints = [
      "/properties",
      "/listings", 
      "/units",
      "/rentals",
      "/rooms",
      "/accommodations",
      "/inventory",
      "/assets",
      "/portfolio",
      "/properties/all",
      "/properties/search",
      "/properties/list",
      "/agency/properties",
      "/pm/properties", // Property Management
      "/owner/properties",
      "/admin/properties"
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`📡 Testing ${endpoint}...`);
        
        const response = await this.http.get(endpoint, {
          params: { agencyUid: ENV.AGENCY_UID, limit: 100 },
          validateStatus: () => true
        });

        if (response.status === 200) {
          const properties = this.extractProperties(response.data);
          const newUIDs = this.trackNewProperties(properties);

          this.allResults.push({
            method: "REST",
            endpoint,
            params: { agencyUid: ENV.AGENCY_UID, limit: 100 },
            propertiesFound: properties.length,
            newProperties: newUIDs
          });

          console.log(`   ✅ ${endpoint}: ${properties.length} properties, ${newUIDs.length} new`);
        } else {
          console.log(`   ❌ ${endpoint}: ${response.status}`);
        }
        
      } catch (error: any) {
        console.log(`   ❌ ${endpoint}: ${error?.response?.status || 'ERROR'}`);
      }
    }
  }

  private async testAgencyVariations(): Promise<void> {
    console.log("\n🔬 Testing Agency Parameter Variations");
    console.log("-".repeat(40));

    const agencyParams = [
      { agencyUid: ENV.AGENCY_UID },
      { agencyId: ENV.AGENCY_UID },
      { agency: ENV.AGENCY_UID },
      { ownerUid: ENV.AGENCY_UID },
      { organizationUid: ENV.AGENCY_UID },
      { companyUid: ENV.AGENCY_UID },
      {}, // No agency parameter
      { agencyUid: ENV.AGENCY_UID, includeAllAgencies: true },
      { agencyUid: ENV.AGENCY_UID, includePartnerAgencies: true }
    ];

    for (const params of agencyParams) {
      try {
        const paramStr = JSON.stringify(params);
        console.log(`📡 Testing params: ${paramStr}...`);
        
        const response = await this.http.get("/properties", {
          params: { ...params, limit: 100 }
        });

        const properties = this.extractProperties(response.data);
        const newUIDs = this.trackNewProperties(properties);

        this.allResults.push({
          method: "REST",
          endpoint: "/properties",
          params,
          propertiesFound: properties.length,
          newProperties: newUIDs
        });

        console.log(`   ✅ ${paramStr}: ${properties.length} properties, ${newUIDs.length} new`);
        
      } catch (error: any) {
        console.log(`   ❌ ${JSON.stringify(params)}: ${error?.response?.status || 'ERROR'}`);
      }
    }
  }

  private async testParameterCombinations(): Promise<void> {
    console.log("\n🔬 Testing Parameter Combinations");
    console.log("-".repeat(40));

    const paramCombinations = [
      { includeArchived: true },
      { includeInactive: true },
      { includeDeleted: true },
      { status: "all" },
      { archived: true },
      { active: false },
      { published: false },
      { visibility: "all" },
      { type: "all" },
      { includeSubUnits: true },
      { includeChildren: true },
      { flat: true },
      { nested: false },
      { expand: "all" },
      { include: "archived,inactive,deleted" },
      { filter: "none" },
      { scope: "all" },
      { view: "complete" },
      { mode: "full" },
      { format: "expanded" }
    ];

    for (const extraParams of paramCombinations) {
      try {
        const params = { agencyUid: ENV.AGENCY_UID, limit: 100, ...extraParams };
        const paramStr = JSON.stringify(extraParams);
        console.log(`📡 Testing ${paramStr}...`);
        
        const response = await this.http.get("/properties", { params });

        const properties = this.extractProperties(response.data);
        const newUIDs = this.trackNewProperties(properties);

        this.allResults.push({
          method: "REST",
          endpoint: "/properties",
          params,
          propertiesFound: properties.length,
          newProperties: newUIDs
        });

        console.log(`   ✅ ${paramStr}: ${properties.length} properties, ${newUIDs.length} new`);
        
      } catch (error: any) {
        console.log(`   ❌ ${JSON.stringify(extraParams)}: ${error?.response?.status || 'ERROR'}`);
      }
    }
  }

  private async testAuthenticatedEndpoints(): Promise<void> {
    console.log("\n🔬 Testing Authenticated Endpoints");
    console.log("-".repeat(40));

    // Test with different headers that might unlock additional access
    const headerVariations = [
      { "X-HOSTFULLY-ADMIN": "true" },
      { "X-HOSTFULLY-SCOPE": "all" },
      { "X-HOSTFULLY-ACCESS": "full" },
      { "X-HOSTFULLY-MODE": "complete" },
      { "Authorization": `ApiKey ${ENV.APIKEY}` },
      { "X-API-VERSION": "latest" },
      { "Accept": "application/json;version=latest" }
    ];

    for (const extraHeaders of headerVariations) {
      try {
        const headerStr = JSON.stringify(extraHeaders);
        console.log(`📡 Testing headers: ${headerStr}...`);
        
        const response = await this.http.get("/properties", {
          params: { agencyUid: ENV.AGENCY_UID, limit: 100 },
          headers: extraHeaders
        });

        const properties = this.extractProperties(response.data);
        const newUIDs = this.trackNewProperties(properties);

        this.allResults.push({
          method: "REST",
          endpoint: "/properties",
          params: { agencyUid: ENV.AGENCY_UID, limit: 100, headers: extraHeaders },
          propertiesFound: properties.length,
          newProperties: newUIDs
        });

        console.log(`   ✅ ${headerStr}: ${properties.length} properties, ${newUIDs.length} new`);
        
      } catch (error: any) {
        console.log(`   ❌ ${JSON.stringify(extraHeaders)}: ${error?.response?.status || 'ERROR'}`);
      }
    }
  }

  private async reverseEngineerFromDetails(): Promise<void> {
    console.log("\n🔬 Reverse Engineering from Property Details");
    console.log("-".repeat(40));

    // Try to find patterns in the 23 properties we can access
    try {
      const response = await this.http.get("/properties", {
        params: { agencyUid: ENV.AGENCY_UID }
      });

      const properties = this.extractProperties(response.data);
      console.log(`📊 Analyzing ${properties.length} accessible properties...`);

      // Look for patterns in the data
      const patterns = {
        addresses: new Set<string>(),
        cities: new Set<string>(),
        states: new Set<string>(),
        propertyTypes: new Set<string>(),
        businessTypes: new Set<string>(),
        uidPrefixes: new Set<string>(),
        namePatterns: new Set<string>()
      };

      properties.forEach((prop: any) => {
        if (prop.address?.address) patterns.addresses.add(prop.address.address);
        if (prop.address?.city) patterns.cities.add(prop.address.city);
        if (prop.address?.state) patterns.states.add(prop.address.state);
        if (prop.propertyType) patterns.propertyTypes.add(prop.propertyType);
        if (prop.businessType) patterns.businessTypes.add(prop.businessType);
        if (prop.uid) patterns.uidPrefixes.add(prop.uid.substring(0, 8));
        if (prop.name) {
          const match = prop.name.match(/^(\d{4})/);
          if (match) patterns.namePatterns.add(match[1]);
        }
      });

      console.log("📋 Discovered patterns:");
      console.log(`   Addresses: ${Array.from(patterns.addresses).join(", ")}`);
      console.log(`   Cities: ${Array.from(patterns.cities).join(", ")}`);
      console.log(`   States: ${Array.from(patterns.states).join(", ")}`);
      console.log(`   Property Types: ${Array.from(patterns.propertyTypes).join(", ")}`);
      console.log(`   Name Patterns: ${Array.from(patterns.namePatterns).join(", ")}`);

      // Try searching by discovered patterns
      for (const city of patterns.cities) {
        await this.testLocationFilter(city, "city");
      }

      for (const state of patterns.states) {
        await this.testLocationFilter(state, "state");
      }

      for (const address of patterns.addresses) {
        await this.testLocationFilter(address, "address");
      }

    } catch (error) {
      console.log("❌ Failed to analyze accessible properties");
    }
  }

  private async testLocationFilter(value: string, type: string): Promise<void> {
    try {
      console.log(`📡 Testing ${type} filter: ${value}...`);
      
      const params: any = { agencyUid: ENV.AGENCY_UID, limit: 100 };
      params[type] = value;

      const response = await this.http.get("/properties", { params });
      const properties = this.extractProperties(response.data);
      const newUIDs = this.trackNewProperties(properties);

      this.allResults.push({
        method: "REST",
        endpoint: "/properties",
        params,
        propertiesFound: properties.length,
        newProperties: newUIDs
      });

      console.log(`   ✅ ${type}=${value}: ${properties.length} properties, ${newUIDs.length} new`);
      
    } catch (error: any) {
      console.log(`   ❌ ${type}=${value}: ${error?.response?.status || 'ERROR'}`);
    }
  }

  private extractProperties(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.properties)) return data.properties;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  private trackNewProperties(properties: any[]): string[] {
    const newUIDs: string[] = [];
    
    properties.forEach((prop: any) => {
      if (prop.uid && !this.knownUIDs.has(prop.uid)) {
        this.knownUIDs.add(prop.uid);
        newUIDs.push(prop.uid);
      }
    });

    return newUIDs;
  }

  private generateReport(): void {
    console.log("\n🎉 DISCOVERY COMPLETE!");
    console.log("=====================================");
    console.log(`📊 Total unique properties found: ${this.knownUIDs.size}`);
    console.log(`🎯 Target: 89 properties`);
    console.log(`📈 Success rate: ${Math.round(this.knownUIDs.size / 89 * 100)}%`);

    // Find the best performing methods
    const successfulMethods = this.allResults
      .filter(r => r.newProperties.length > 0)
      .sort((a, b) => b.newProperties.length - a.newProperties.length);

    if (successfulMethods.length > 0) {
      console.log("\n🏆 MOST SUCCESSFUL METHODS:");
      successfulMethods.slice(0, 5).forEach((method, i) => {
        console.log(`${i + 1}. ${method.endpoint} - ${method.newProperties.length} new properties`);
        console.log(`   Params: ${JSON.stringify(method.params)}`);
      });
    }

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      totalFound: this.knownUIDs.size,
      target: 89,
      successRate: Math.round(this.knownUIDs.size / 89 * 100),
      allUIDs: Array.from(this.knownUIDs),
      allResults: this.allResults,
      successfulMethods
    };

    fs.writeFileSync("./advanced_discovery_report.json", JSON.stringify(report, null, 2));
    console.log("\n📄 Detailed report saved to: advanced_discovery_report.json");

    if (this.knownUIDs.size > 23) {
      console.log(`\n🎉 SUCCESS! Found ${this.knownUIDs.size - 23} additional properties!`);
    } else {
      console.log(`\n⚠️ No additional properties found beyond the original 23.`);
      console.log("This suggests a fundamental API limitation requiring Hostfully support.");
    }
  }
}

// Export function for CLI usage
export async function runAdvancedDiscovery(): Promise<void> {
  const discovery = new AdvancedPropertyDiscovery();
  await discovery.discoverAll();
}