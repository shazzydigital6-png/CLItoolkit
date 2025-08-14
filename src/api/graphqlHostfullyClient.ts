// src/api/graphqlHostfullyClient.ts
import axios from "axios";
import { ENV } from "../utils/env";

export interface GraphQLProperty {
  uid: string;
  name: string;
  isActive: boolean;
  mainPicture?: {
    tinyThumbnail?: string;
    largeThumbnail?: string;
  };
  businessType: string;
  propertyType: string;
  availability: {
    maxGuests: number;
  };
  address: {
    address: string;
    address2?: string;
    zipCode: string;
    city: string;
    state: string;
  };
  subUnits: any[];
  numberOfSubUnits: number;
  pricing: {
    currency: string;
  };
  tags: string[];
}

// Add compatibility interface for CLI commands
export interface Property {
  uid: string;
  name?: string;
  title?: string;
  isActive: boolean;
  [key: string]: any;
}

export class GraphQLHostfullyClient {
  private http = axios.create({
    baseURL: ENV.BASE,
    timeout: 30000,
  });

  private authToken: string | null = null;

  constructor(authToken?: string) {
    this.authToken = authToken || this.extractTokenFromEnv();
    console.log(`🔧 GraphQL Client initialized with base URL: ${ENV.BASE}`);
    console.log(`🔧 Agency UID: ${ENV.AGENCY_UID}`);
    console.log(`🔧 Auth token: ${this.authToken ? 'Present' : 'None'}`);
  }

  private extractTokenFromEnv(): string | null {
    return process.env.HOSTFULLY_JWT_TOKEN || null;
  }

  async getAllProperties(): Promise<GraphQLProperty[]> {
    console.log(`🔍 Starting GraphQL query for properties...`);
    
    try {
      console.log(`🔍 Trying to get all properties using different strategies...`);
      
      let allProperties: GraphQLProperty[] = [];
      let uniqueUIDs = new Set<string>();
      
      // Strategy 1: Basic query
      console.log(`📡 Strategy 1: Basic query`);
      try {
        const basicQuery = `{
          properties(agencyUid: "${ENV.AGENCY_UID}") {
            uid,
            name,
            isActive,
            mainPicture {
              tinyThumbnail,
              largeThumbnail
            },
            businessType,
            propertyType,
            availability {
              maxGuests
            },
            address {
              address,
              address2,
              zipCode,
              city,
              state
            },
            subUnits {
              uid,
              isActive,
              name,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              availability {
                maxGuests
              },
              businessType,
              propertyType,
              tags
            },
            numberOfSubUnits,
            pricing {
              currency
            },
            tags
          }
        }`;
        
        const basicResult = await this.executeQuery(basicQuery, "BasicProperties");
        if (basicResult && basicResult.length > 0) {
          basicResult.forEach(prop => {
            if (!uniqueUIDs.has(prop.uid)) {
              uniqueUIDs.add(prop.uid);
              allProperties.push(prop);
            }
          });
          console.log(`✅ Basic query: ${basicResult.length} properties`);
        }
      } catch (basicError) {
        console.log(`❌ Basic query failed`);
      }
      
      // Strategy 2: Include all sub-units (topLevelOnly: false)
      console.log(`📡 Strategy 2: Include sub-units`);
      try {
        const subUnitsQuery = `{
          properties(agencyUid: "${ENV.AGENCY_UID}", topLevelOnly: false) {
            uid,
            name,
            isActive,
            mainPicture {
              tinyThumbnail,
              largeThumbnail
            },
            businessType,
            propertyType,
            availability {
              maxGuests
            },
            address {
              address,
              address2,
              zipCode,
              city,
              state
            },
            subUnits {
              uid,
              isActive,
              name,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              availability {
                maxGuests
              },
              businessType,
              propertyType,
              tags
            },
            numberOfSubUnits,
            pricing {
              currency
            },
            tags
          }
        }`;
        
        const subUnitsResult = await this.executeQuery(subUnitsQuery, "PropertiesWithSubUnits");
        if (subUnitsResult && subUnitsResult.length > 0) {
          let newCount = 0;
          subUnitsResult.forEach(prop => {
            if (!uniqueUIDs.has(prop.uid)) {
              uniqueUIDs.add(prop.uid);
              allProperties.push(prop);
              newCount++;
            }
          });
          console.log(`✅ Sub-units query: ${subUnitsResult.length} total, ${newCount} new properties`);
        }
      } catch (subUnitsError) {
        console.log(`❌ Sub-units query failed`);
      }
      
      // Strategy 3: Try different sorting to get different sets
      console.log(`📡 Strategy 3: Different sorting strategies`);
      const sortStrategies = ['SORT_BY_NAME'];
      
      for (const sortStrategy of sortStrategies) {
        try {
          const sortedQuery = `{
            properties(agencyUid: "${ENV.AGENCY_UID}", sortStrategy: ${sortStrategy}) {
              uid,
              name,
              isActive,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              businessType,
              propertyType,
              availability {
                maxGuests
              },
              address {
                address,
                address2,
                zipCode,
                city,
                state
              },
              subUnits {
                uid,
                isActive,
                name,
                mainPicture {
                  tinyThumbnail,
                  largeThumbnail
                },
                availability {
                  maxGuests
                },
                businessType,
                propertyType,
                tags
              },
              numberOfSubUnits,
              pricing {
                currency
              },
              tags
            }
          }`;
          
          const sortedResult = await this.executeQuery(sortedQuery, `Properties${sortStrategy}`);
          if (sortedResult && sortedResult.length > 0) {
            let newCount = 0;
            sortedResult.forEach(prop => {
              if (!uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                allProperties.push(prop);
                newCount++;
              }
            });
            console.log(`✅ ${sortStrategy}: ${sortedResult.length} total, ${newCount} new properties`);
          }
        } catch (sortError) {
          console.log(`❌ ${sortStrategy} failed`);
        }
      }
      
      // Strategy 4: Try filtering by different criteria to get different sets
      console.log(`📡 Strategy 4: Filter by different criteria`);
      
      // Try different bedroom counts
      for (const bedrooms of [1, 2, 3, 4, 5, 6, 10]) {
        try {
          const bedroomQuery = `{
            properties(agencyUid: "${ENV.AGENCY_UID}", maximumBedrooms: ${bedrooms}) {
              uid,
              name,
              isActive,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              businessType,
              propertyType,
              availability {
                maxGuests
              },
              address {
                address,
                address2,
                zipCode,
                city,
                state
              },
              subUnits {
                uid,
                isActive,
                name,
                mainPicture {
                  tinyThumbnail,
                  largeThumbnail
                },
                availability {
                  maxGuests
                },
                businessType,
                propertyType,
                tags
              },
              numberOfSubUnits,
              pricing {
                currency
              },
              tags
            }
          }`;
          
          const bedroomResult = await this.executeQuery(bedroomQuery, `PropertiesBed${bedrooms}`);
          if (bedroomResult && bedroomResult.length > 0) {
            let newCount = 0;
            bedroomResult.forEach(prop => {
              if (!uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                allProperties.push(prop);
                newCount++;
              }
            });
            console.log(`✅ Max ${bedrooms} bedrooms: ${bedroomResult.length} total, ${newCount} new`);
          }
        } catch (bedroomError) {
          console.log(`❌ ${bedrooms} bedrooms failed`);
        }
      }
      
      // Try different guest counts
      for (const guests of [2, 4, 6, 8, 10, 12, 16, 20]) {
        try {
          const guestQuery = `{
            properties(agencyUid: "${ENV.AGENCY_UID}", maximumGuests: ${guests}) {
              uid,
              name,
              isActive,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              businessType,
              propertyType,
              availability {
                maxGuests
              },
              address {
                address,
                address2,
                zipCode,
                city,
                state
              },
              subUnits {
                uid,
                isActive,
                name,
                mainPicture {
                  tinyThumbnail,
                  largeThumbnail
                },
                availability {
                  maxGuests
                },
                businessType,
                propertyType,
                tags
              },
              numberOfSubUnits,
              pricing {
                currency
              },
              tags
            }
          }`;
          
          const guestResult = await this.executeQuery(guestQuery, `PropertiesGuest${guests}`);
          if (guestResult && guestResult.length > 0) {
            let newCount = 0;
            guestResult.forEach(prop => {
              if (!uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                allProperties.push(prop);
                newCount++;
              }
            });
            console.log(`✅ Max ${guests} guests: ${guestResult.length} total, ${newCount} new`);
          }
        } catch (guestError) {
          console.log(`❌ ${guests} guests failed`);
        }
      }
      
      // Strategy 5: Try different property types and business types
      console.log(`📡 Strategy 5: Try different property and business types`);
      
      const propertyTypes = ['APARTMENT', 'HOUSE', 'CONDO', 'VILLA', 'TOWNHOUSE', 'STUDIO'];
      const businessTypes = ['RENTAL', 'HOTEL', 'RESORT', 'BNB'];
      
      for (const propType of propertyTypes) {
        try {
          const typeQuery = `{
            properties(agencyUid: "${ENV.AGENCY_UID}", propertyType: "${propType}") {
              uid,
              name,
              isActive,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              businessType,
              propertyType,
              availability {
                maxGuests
              },
              address {
                address,
                address2,
                zipCode,
                city,
                state
              },
              subUnits {
                uid,
                isActive,
                name,
                mainPicture {
                  tinyThumbnail,
                  largeThumbnail
                },
                availability {
                  maxGuests
                },
                businessType,
                propertyType,
                tags
              },
              numberOfSubUnits,
              pricing {
                currency
              },
              tags
            }
          }`;
          
          const typeResult = await this.executeQuery(typeQuery, `Properties${propType}`);
          if (typeResult && typeResult.length > 0) {
            let newCount = 0;
            typeResult.forEach(prop => {
              if (!uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                allProperties.push(prop);
                newCount++;
              }
            });
            console.log(`✅ Type ${propType}: ${typeResult.length} total, ${newCount} new`);
          }
        } catch (typeError) {
          console.log(`❌ Type ${propType} failed`);
        }
      }
      
      for (const bizType of businessTypes) {
        try {
          const bizQuery = `{
            properties(agencyUid: "${ENV.AGENCY_UID}", businessType: "${bizType}") {
              uid,
              name,
              isActive,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              businessType,
              propertyType,
              availability {
                maxGuests
              },
              address {
                address,
                address2,
                zipCode,
                city,
                state
              },
              subUnits {
                uid,
                isActive,
                name,
                mainPicture {
                  tinyThumbnail,
                  largeThumbnail
                },
                availability {
                  maxGuests
                },
                businessType,
                propertyType,
                tags
              },
              numberOfSubUnits,
              pricing {
                currency
              },
              tags
            }
          }`;
          
          const bizResult = await this.executeQuery(bizQuery, `PropertiesBiz${bizType}`);
          if (bizResult && bizResult.length > 0) {
            let newCount = 0;
            bizResult.forEach(prop => {
              if (!uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                allProperties.push(prop);
                newCount++;
              }
            });
            console.log(`✅ BusinessType ${bizType}: ${bizResult.length} total, ${newCount} new`);
          }
        } catch (bizError) {
          console.log(`❌ BusinessType ${bizType} failed`);
        }
      }
      
      // Strategy 6: Try to get inactive/archived properties
      console.log(`📡 Strategy 6: Try inactive and archived properties`);
      
      const statusFilters = [
        { name: 'inactive', query: `properties(agencyUid: "${ENV.AGENCY_UID}", isActive: false)` },
        { name: 'all-statuses', query: `properties(agencyUid: "${ENV.AGENCY_UID}")` }
      ];
      
      for (const filter of statusFilters) {
        try {
          const statusQuery = `{
            ${filter.query} {
              uid,
              name,
              isActive,
              mainPicture {
                tinyThumbnail,
                largeThumbnail
              },
              businessType,
              propertyType,
              availability {
                maxGuests
              },
              address {
                address,
                address2,
                zipCode,
                city,
                state
              },
              subUnits {
                uid,
                isActive,
                name,
                mainPicture {
                  tinyThumbnail,
                  largeThumbnail
                },
                availability {
                  maxGuests
                },
                businessType,
                propertyType,
                tags
              },
              numberOfSubUnits,
              pricing {
                currency
              },
              tags
            }
          }`;
          
          const statusResult = await this.executeQuery(statusQuery, `Properties${filter.name}`);
          if (statusResult && statusResult.length > 0) {
            let newCount = 0;
            statusResult.forEach(prop => {
              if (!uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                allProperties.push(prop);
                newCount++;
              }
            });
            console.log(`✅ Filter ${filter.name}: ${statusResult.length} total, ${newCount} new`);
          }
        } catch (statusError) {
          console.log(`❌ Filter ${filter.name} failed`);
        }
      }
      
      // Strategy 7: Enhanced REST API fallback with different parameters
      console.log(`\n📡 Strategy 7: Enhanced REST API fallback`);
      
      if (allProperties.length < 50) {
        const restStrategies = [
          { name: 'all-properties', params: { agencyUid: ENV.AGENCY_UID, limit: 100 } },
          { name: 'include-archived', params: { agencyUid: ENV.AGENCY_UID, includeArchived: true, limit: 100 } },
          { name: 'no-limit', params: { agencyUid: ENV.AGENCY_UID } },
          { name: 'different-endpoint', endpoint: '/listings', params: { agencyUid: ENV.AGENCY_UID, limit: 100 } }
        ];
        
        for (const strategy of restStrategies) {
          try {
            console.log(`⚠️ Trying REST strategy: ${strategy.name}`);
            
            const endpoint = strategy.endpoint || '/properties';
            const restResponse = await this.http.get(endpoint, {
              params: strategy.params,
              headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
            });
            
            const restProperties = restResponse.data?.properties || restResponse.data?.data || restResponse.data || [];
            console.log(`📊 REST ${strategy.name} found ${restProperties.length} properties`);
            
            if (restProperties.length > 0) {
              let restNewCount = 0;
              restProperties.forEach((restProp: any) => {
                if (!uniqueUIDs.has(restProp.uid)) {
                  uniqueUIDs.add(restProp.uid);
                  
                  // Convert REST format to GraphQL format
                  const convertedProp: GraphQLProperty = {
                    uid: restProp.uid,
                    name: restProp.name || restProp.title || '',
                    isActive: restProp.isActive !== false, // Default to true if not specified
                    mainPicture: restProp.mainPicture || {},
                    businessType: restProp.businessType || '',
                    propertyType: restProp.propertyType || '',
                    availability: {
                      maxGuests: restProp.maxGuests || restProp.availability?.maxGuests || 0
                    },
                    address: {
                      address: restProp.address?.address || '',
                      address2: restProp.address?.address2 || '',
                      zipCode: restProp.address?.zipCode || '',
                      city: restProp.address?.city || '',
                      state: restProp.address?.state || ''
                    },
                    subUnits: restProp.subUnits || [],
                    numberOfSubUnits: restProp.numberOfSubUnits || 0,
                    pricing: {
                      currency: restProp.pricing?.currency || 'USD'
                    },
                    tags: restProp.tags || []
                  };
                  
                  allProperties.push(convertedProp);
                  restNewCount++;
                }
              });
              
              console.log(`✅ REST ${strategy.name} added ${restNewCount} new properties`);
              
              if (allProperties.length >= 80) {
                console.log(`🎉 Found most properties (${allProperties.length}), stopping REST search`);
                break;
              }
            }
            
          } catch (restError) {
            console.log(`❌ REST ${strategy.name} failed:`, restError);
          }
        }
      }
      
      console.log(`\n🎉 COLLECTION COMPLETE!`);
      console.log(`📊 Total unique properties found: ${allProperties.length}`);
      console.log(`🎯 Expected: 89 properties`);
      console.log(`📈 Success rate: ${Math.round(allProperties.length / 89 * 100)}%`);
      
      if (allProperties.length > 20) {
        console.log(`✅ SUCCESS! Found more than the default 20 properties!`);
      }
      
      return allProperties;
      
    } catch (error: any) {
      console.error('❌ All collection strategies failed:', error?.message);
      await this.debugApiAccess();
      throw error;
    }
  }

  private async executeQuery(query: string, operationName: string): Promise<GraphQLProperty[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-HOSTFULLY-APIKEY': ENV.APIKEY,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    console.log(`📡 Making GraphQL request to ${ENV.BASE}/graphql`);
    console.log(`📡 Headers:`, Object.keys(headers));

    const response = await this.http.post('/graphql', {
      operationName,
      query,
      variables: {}
    }, { headers });

    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response data keys:`, Object.keys(response.data || {}));

    if (response.data?.errors) {
      console.error('❌ GraphQL errors:', response.data.errors);
    }

    const properties = response.data?.data?.properties || [];
    console.log(`📊 Found ${properties.length} properties in response`);
    
    return properties;
  }

  private async debugApiAccess(): Promise<void> {
    console.log(`\n🔍 DEBUGGING API ACCESS`);
    console.log(`===============================`);
    
    try {
      // Test basic REST API access
      console.log(`🔍 Testing REST API access...`);
      const restResponse = await this.http.get('/agencies', {
        headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
      });
      
      console.log(`✅ REST API works! Status: ${restResponse.status}`);
      console.log(`📊 Agencies found: ${restResponse.data?.agencies?.length || 0}`);
      
      if (restResponse.data?.agencies) {
        restResponse.data.agencies.forEach((agency: any, i: number) => {
          console.log(`   ${i+1}. ${agency.name} (${agency.uid})`);
          if (agency.uid === ENV.AGENCY_UID) {
            console.log(`      👆 This is your configured agency!`);
          }
        });
      }
      
    } catch (restError: any) {
      console.error(`❌ REST API also failed:`, restError?.response?.status, restError?.message);
    }
    
    console.log(`\n💡 DEBUGGING COMPLETE - Check results above`);
  }

  // Compatibility method for CLI - alias for getAllProperties
  async listAllProperties(): Promise<Property[]> {
    const graphqlProperties = await this.getAllProperties();
    // Convert GraphQLProperty to Property format for compatibility
    return graphqlProperties.map(p => ({
      uid: p.uid,
      name: p.name,
      title: p.name, // Alias for compatibility
      isActive: p.isActive,
      businessType: p.businessType,
      propertyType: p.propertyType,
      availability: p.availability,
      address: p.address,
      // Include all other properties for compatibility
      ...p
    }));
  }

  // Compatibility method for CLI diagnostics
  async whoAmI(): Promise<any> {
    try {
      // Try to get agency info via GraphQL
      const properties = await this.getAllProperties();
      return {
        success: true,
        message: `GraphQL access working - found ${properties.length} properties`,
        agencyUid: ENV.AGENCY_UID,
        method: 'GraphQL',
        propertiesCount: properties.length
      };
    } catch (error: any) {
      // Fallback to REST API check
      try {
        const response = await this.http.get('/agencies', {
          headers: {
            'X-HOSTFULLY-APIKEY': ENV.APIKEY,
          }
        });
        
        return {
          success: true,
          message: 'REST API access working',
          data: response.data,
          method: 'REST'
        };
      } catch (restError: any) {
        throw new Error(`Both GraphQL and REST API failed. GraphQL: ${error?.message}, REST: ${restError?.message}`);
      }
    }
  }

  // Get individual property with more details
  async getPropertyDetails(uid: string): Promise<any> {
    const query = `{
      property(uid: "${uid}") {
        uid,
        name,
        summary,
        description,
        isActive,
        businessType,
        propertyType,
        availability {
          maxGuests
        },
        address {
          address,
          address2,
          zipCode,
          city,
          state,
          latitude,
          longitude
        },
        pricing {
          currency
        },
        tags,
        amenities {
          uid,
          name,
          category
        },
        photos {
          uid,
          url,
          description,
          order
        }
      }
    }`;

    try {
      const response = await this.http.post('/graphql', {
        operationName: "PropertyDetails",
        query,
        variables: {}
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authToken ? `Bearer ${this.authToken}` : undefined,
          'X-HOSTFULLY-APIKEY': ENV.APIKEY,
        }
      });

      return response.data?.data?.property;
    } catch (error: any) {
      console.error(`❌ Failed to get property ${uid}:`, error?.response?.status);
      throw error;
    }
  }

  // Update property via GraphQL mutation
  async updateProperty(uid: string, updates: Record<string, any>): Promise<boolean> {
    const mutation = `
      mutation UpdateProperty($uid: String!, $input: PropertyInput!) {
        updateProperty(uid: $uid, input: $input) {
          uid,
          name,
          isActive
        }
      }
    `;

    try {
      const response = await this.http.post('/graphql', {
        operationName: "UpdateProperty",
        query: mutation,
        variables: {
          uid,
          input: updates
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.authToken ? `Bearer ${this.authToken}` : undefined,
          'X-HOSTFULLY-APIKEY': ENV.APIKEY,
        }
      });

      const success = !!response.data?.data?.updateProperty;
      console.log(`${success ? '✅' : '❌'} Update property ${uid}: ${success ? 'SUCCESS' : 'FAILED'}`);
      
      return success;
    } catch (error: any) {
      console.error(`❌ Failed to update property ${uid}:`, error?.response?.status, error?.response?.data || error?.message);
      return false;
    }
  }

  // Bulk update multiple properties
  async bulkUpdateProperties(updates: Array<{uid: string; data: Record<string, any>}>): Promise<{successful: number; failed: number}> {
    console.log(`🔄 Starting bulk update of ${updates.length} properties via GraphQL...`);
    
    let successful = 0;
    let failed = 0;
    
    const THROTTLE_MS = Number(process.env.THROTTLE_MS || 1000);
    
    for (let i = 0; i < updates.length; i++) {
      const { uid, data } = updates[i];
      
      console.log(`[${i + 1}/${updates.length}] Updating ${uid}...`);
      
      try {
        const success = await this.updateProperty(uid, data);
        if (success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error(`❌ ${uid} failed:`, error);
      }
      
      // Throttle between updates
      if (THROTTLE_MS && i < updates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, THROTTLE_MS));
      }
    }
    
    console.log(`\n📊 Bulk update complete: ${successful} successful, ${failed} failed`);
    return { successful, failed };
  }

  // Test authentication and access
  async testAccess(): Promise<boolean> {
    try {
      const properties = await this.getAllProperties();
      console.log(`✅ GraphQL access test successful: ${properties.length} properties found`);
      return true;
    } catch (error) {
      console.error('❌ GraphQL access test failed:', error);
      return false;
    }
  }
}