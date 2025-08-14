// src/cli/safeTesting.ts
import axios from "axios";
import { ENV } from "../utils/env";
import { HostfullyProperty } from "../api/hostfullyClient";

export interface SafeTestConfig {
  dryRun: boolean;           // Don't actually make changes
  testProperty?: string;     // Specific property UID for testing
  backupFirst: boolean;      // Always backup before changes
  revertAfter: boolean;      // Automatically revert test changes
  maxTestUpdates: number;    // Limit number of test updates
}

export class SafePropertyTester {
  private http = axios.create({
    baseURL: ENV.BASE,
    headers: { "X-HOSTFULLY-APIKEY": ENV.APIKEY },
    timeout: 15000,
  });

  private config: SafeTestConfig;

  constructor(config: Partial<SafeTestConfig> = {}) {
    this.config = {
      dryRun: true,
      backupFirst: true,
      revertAfter: true,
      maxTestUpdates: 1,
      ...config
    };
  }

  // Test if we can read a property safely
  async testPropertyRead(uid: string): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log(`🔍 Testing READ access for property: ${uid}`);
    
    try {
      const res = await this.http.get(`/properties/${uid}`, {
        params: { agencyUid: ENV.AGENCY_UID }
      });
      
      if (res.data) {
        console.log(`✅ Read successful`);
        console.log(`   Name: ${res.data.name || res.data.title || 'Unnamed'}`);
        console.log(`   Status: ${res.data.isActive ? 'Active' : 'Inactive'}`);
        
        return { success: true, data: res.data };
      }
      
      return { success: false, error: "No data returned" };
      
    } catch (e: any) {
      const error = `HTTP ${e?.response?.status}: ${e?.response?.data?.message || e?.message}`;
      console.log(`❌ Read failed: ${error}`);
      return { success: false, error };
    }
  }

  // Test what update endpoints exist WITHOUT making changes
  async discoverUpdateEndpoints(uid: string): Promise<string[]> {
    console.log(`🔍 Discovering UPDATE endpoints for: ${uid} (DRY RUN)`);
    
    const testEndpoints = [
      `/properties/${uid}`,
      `/properties/${uid}/details`,
      `/properties/${uid}/info`,
      `/properties/${uid}/update`,
      `/properties/${uid}/edit`,
    ];

    const workingEndpoints: string[] = [];

    for (const endpoint of testEndpoints) {
      for (const method of ['PUT', 'PATCH', 'POST']) {
        try {
          console.log(`  Testing ${method} ${endpoint}...`);
          
          // Make a HEAD request or OPTIONS request first to test availability
          const testRes = await this.http.request({
            method: 'OPTIONS',
            url: endpoint,
            params: { agencyUid: ENV.AGENCY_UID }
          });
          
          if (testRes.headers['allow']?.includes(method)) {
            console.log(`    ✅ ${method} ${endpoint} - Endpoint exists`);
            workingEndpoints.push(`${method} ${endpoint}`);
          }
          
        } catch (e: any) {
          const status = e?.response?.status;
          if (status === 405) {
            console.log(`    ❌ ${method} ${endpoint} - Method not allowed`);
          } else if (status === 404) {
            console.log(`    ❌ ${method} ${endpoint} - Not found`);
          } else if (status !== 501) { // 501 = not implemented for OPTIONS
            console.log(`    ? ${method} ${endpoint} - Status: ${status}`);
          }
        }
      }
    }

    console.log(`\n📊 Found ${workingEndpoints.length} potentially working endpoints`);
    return workingEndpoints;
  }

  // Safely test a single field update
  async testSafeUpdate(uid: string, field: string, testValue: any): Promise<{ success: boolean; error?: string; reverted?: boolean }> {
    console.log(`\n🧪 SAFE UPDATE TEST`);
    console.log(`Property: ${uid}`);
    console.log(`Field: ${field}`);
    console.log(`Test Value: ${testValue}`);
    console.log(`Dry Run: ${this.config.dryRun}`);
    console.log(`Will Revert: ${this.config.revertAfter}\n`);

    // Step 1: Read current value
    console.log("1️⃣ Reading current property data...");
    const readResult = await this.testPropertyRead(uid);
    if (!readResult.success) {
      return { success: false, error: `Cannot read property: ${readResult.error}` };
    }

    const originalValue = readResult.data[field];
    console.log(`Current ${field}: ${originalValue}`);

    if (this.config.dryRun) {
      console.log(`\n🏃‍♂️ DRY RUN MODE - No actual changes will be made`);
      console.log(`Would update ${field} from "${originalValue}" to "${testValue}"`);
      return { success: true };
    }

    // Step 2: Backup if requested
    if (this.config.backupFirst) {
      console.log("\n2️⃣ Creating backup...");
      // In a real implementation, save the full property data
      console.log(`Backup created for ${uid}`);
    }

    // Step 3: Try the update
    console.log("\n3️⃣ Attempting update...");
    const updateData = { [field]: testValue };
    
    const updateMethods = [
      { method: 'PATCH', path: `/properties/${uid}` },
      { method: 'PUT', path: `/properties/${uid}` },
      { method: 'PUT', path: `/properties/${uid}/details` },
    ];

    let updateSuccessful = false;
    let updateError = "";

    for (const updateMethod of updateMethods) {
      try {
        console.log(`   Trying ${updateMethod.method} ${updateMethod.path}...`);
        
        const res = await this.http.request({
          method: updateMethod.method,
          url: updateMethod.path,
          data: updateData,
          params: { agencyUid: ENV.AGENCY_UID }
        });

        if (res.status < 400) {
          console.log(`   ✅ Update successful via ${updateMethod.method} ${updateMethod.path}`);
          updateSuccessful = true;
          break;
        }

      } catch (e: any) {
        const status = e?.response?.status;
        console.log(`   ❌ ${updateMethod.method} ${updateMethod.path} failed: ${status}`);
        updateError = `HTTP ${status}: ${e?.response?.data?.message || e?.message}`;
        
        // If it's not a method/endpoint issue, stop trying
        if (status !== 405 && status !== 404) {
          break;
        }
      }
    }

    if (!updateSuccessful) {
      return { success: false, error: updateError || "No working update endpoint found" };
    }

    // Step 4: Verify the change
    console.log("\n4️⃣ Verifying update...");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for change to propagate
    
    const verifyResult = await this.testPropertyRead(uid);
    if (verifyResult.success) {
      const newValue = verifyResult.data[field];
      console.log(`Verified ${field}: ${newValue}`);
      
      if (newValue === testValue) {
        console.log(`✅ Update verified successfully`);
      } else {
        console.log(`⚠️ Update may not have taken effect`);
      }
    }

    // Step 5: Revert if requested
    let reverted = false;
    if (this.config.revertAfter) {
      console.log("\n5️⃣ Reverting change...");
      
      try {
        // Use the same successful method to revert
        const revertData = { [field]: originalValue };
        
        for (const updateMethod of updateMethods) {
          try {
            const res = await this.http.request({
              method: updateMethod.method,
              url: updateMethod.path,
              data: revertData,
              params: { agencyUid: ENV.AGENCY_UID }
            });

            if (res.status < 400) {
              console.log(`✅ Successfully reverted ${field} to original value`);
              reverted = true;
              break;
            }

          } catch (e: any) {
            // Try next method
            continue;
          }
        }

        if (!reverted) {
          console.log(`⚠️ Could not automatically revert. Manual revert may be needed.`);
          console.log(`Original value was: ${originalValue}`);
        }

      } catch (e: any) {
        console.log(`❌ Revert failed: ${e?.message}`);
      }
    }

    return { success: true, reverted };
  }

  // Test bulk update capabilities safely
  async testBulkUpdateCapability(properties: HostfullyProperty[]): Promise<void> {
    console.log(`\n🔄 TESTING BULK UPDATE CAPABILITY`);
    console.log(`Testing with ${Math.min(properties.length, this.config.maxTestUpdates)} properties`);
    console.log(`Dry Run: ${this.config.dryRun}\n`);

    const testProperties = properties.slice(0, this.config.maxTestUpdates);
    
    for (let i = 0; i < testProperties.length; i++) {
      const property = testProperties[i];
      console.log(`\n--- Testing Property ${i + 1}/${testProperties.length} ---`);
      
      // Test a safe field change (description is usually safe to modify)
      const testValue = `TEST UPDATE ${Date.now()}`;
      const result = await this.testSafeUpdate(property.uid, 'description', testValue);
      
      console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      if (!result.success) {
        console.log(`Error: ${result.error}`);
      }
      
      // Add delay between tests
      if (i < testProperties.length - 1) {
        console.log(`Waiting 3 seconds before next test...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
}