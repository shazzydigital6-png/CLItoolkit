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
      
      // Strategy 5: Try different property types and business types (will fail but we'll skip them)
      console.log(`📡 Strategy 5: Try different property and business types`);
      console.log(`⚠️ Skipping property/business type filters (known to fail)`);
      
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

      // Strategy 8: Test pagination parameters
      console.log(`\n📡 Strategy 8: Testing pagination strategies`);
      const paginationResults = await this.tryPaginationStrategies();
      paginationResults.forEach(prop => {
        if (!uniqueUIDs.has(prop.uid)) {
          uniqueUIDs.add(prop.uid);
          allProperties.push(prop);
        }
      });

      // Strategy 9: Test agency contexts  
      console.log(`\n📡 Strategy 9: Testing agency contexts`);
      const agencyResults = await this.tryAgencyContexts();
      agencyResults.forEach(prop => {
        if (!uniqueUIDs.has(prop.uid)) {
          uniqueUIDs.add(prop.uid);
          allProperties.push(prop);
        }
      });

      // Strategy 10: Targeted discovery based on found patterns
      console.log(`\n📡 Strategy 10: Targeted discovery for missing units`);
      const targetedResults = await this.discoverMissingUnits();
      targetedResults.forEach(prop => {
        if (!uniqueUIDs.has(prop.uid)) {
          uniqueUIDs.add(prop.uid);
          allProperties.push(prop);
        }
      });

      // If we still don't have enough, run schema discovery for debugging
      if (allProperties.length < 50) {
        console.log(`\n📡 Strategy 11: Schema discovery for debugging`);
        await this.discoverGraphQLSchema();
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

  // Helper method to extract properties from various response formats
  private extractProperties(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.properties)) return data.properties;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  // Discover GraphQL schema to understand available arguments
  async discoverGraphQLSchema(): Promise<void> {
    console.log("🔍 Discovering GraphQL Schema...");
    
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          queryType {
            fields {
              name
              args {
                name
                type {
                  name
                  kind
                  ofType {
                    name
                    kind
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.http.post('/graphql', {
        operationName: "IntrospectionQuery",
        query: introspectionQuery,
        variables: {}
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-HOSTFULLY-APIKEY': ENV.APIKEY,
        }
      });

      const schema = response.data?.data?.__schema;
      if (schema) {
        const propertiesField = schema.queryType.fields.find((f: any) => f.name === 'properties');
        
        if (propertiesField) {
          console.log("📋 Available 'properties' query arguments:");
          propertiesField.args.forEach((arg: any) => {
            const typeName = arg.type.name || arg.type.ofType?.name || 'Unknown';
            console.log(`   ${arg.name}: ${typeName}`);
          });
        }

        console.log("\n📋 All available query fields:");
        schema.queryType.fields.forEach((field: any) => {
          console.log(`   ${field.name}`);
        });
      }
    } catch (error: any) {
      console.log("❌ Schema introspection failed:", error?.response?.status);
      
      // Fallback: try some common argument names
      console.log("\n🔍 Testing common GraphQL arguments...");
      const testArgs = [
        'limit', 'offset', 'skip', 'first', 'after', 'before', 'last',
        'agencyUid', 'agencyId', 'ownerId', 'organizationId',
        'isActive', 'status', 'published', 'archived',
        'city', 'state', 'country', 'address',
        'minimumGuests', 'maximumGuests', 'minGuests', 'maxGuests',
        'minimumBedrooms', 'maximumBedrooms', 'minBedrooms', 'maxBedrooms',
        'propertyTypes', 'businessTypes', 'types',
        'includeInactive', 'includeArchived', 'includeAll'
      ];

      for (const arg of testArgs) {
        try {
          const testQuery = `{
            properties(agencyUid: "${ENV.AGENCY_UID}", ${arg}: 1) {
              uid
            }
          }`;
          
          const testResponse = await this.http.post('/graphql', {
            query: testQuery
          }, {
            headers: {
              'Content-Type': 'application/json',
              'X-HOSTFULLY-APIKEY': ENV.APIKEY,
            }
          });

          if (!testResponse.data?.errors) {
            console.log(`   ✅ ${arg} - VALID`);
          }
        } catch (e) {
          // Most will fail, ignore
        }
      }
    }
  }

  // Test pagination strategies
  private async tryPaginationStrategies(): Promise<GraphQLProperty[]> {
    console.log(`📡 Testing GraphQL pagination strategies`);
    const allProperties: GraphQLProperty[] = [];
    const uniqueUIDs = new Set<string>();

    // Try different pagination approaches
    const paginationStrategies = [
      // Offset-based pagination
      { name: 'offset-0', params: 'offset: 0, limit: 100' },
      { name: 'offset-20', params: 'offset: 20, limit: 100' },
      { name: 'offset-40', params: 'offset: 40, limit: 100' },
      { name: 'offset-60', params: 'offset: 60, limit: 100' },
      
      // First/after cursor pagination
      { name: 'first-50', params: 'first: 50' },
      { name: 'first-100', params: 'first: 100' },
      
      // Different limit sizes
      { name: 'limit-5', params: 'limit: 5' },
      { name: 'limit-15', params: 'limit: 15' },
      { name: 'limit-25', params: 'limit: 25' },
      { name: 'limit-50', params: 'limit: 50' },
      { name: 'limit-100', params: 'limit: 100' },
      
      // Skip-based
      { name: 'skip-20', params: 'skip: 20, limit: 50' },
      { name: 'skip-40', params: 'skip: 40, limit: 50' },
    ];

    for (const strategy of paginationStrategies) {
      try {
        const query = `{
          properties(agencyUid: "${ENV.AGENCY_UID}", ${strategy.params}) {
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
              name
            },
            numberOfSubUnits,
            pricing {
              currency
            },
            tags
          }
        }`;
        
        const result = await this.executeQuery(query, `Pagination${strategy.name}`);
        if (result && result.length > 0) {
          let newCount = 0;
          result.forEach(prop => {
            if (!uniqueUIDs.has(prop.uid)) {
              uniqueUIDs.add(prop.uid);
              allProperties.push(prop);
              newCount++;
            }
          });
          console.log(`✅ ${strategy.name}: ${result.length} total, ${newCount} new properties`);
        } else {
          console.log(`❌ ${strategy.name}: No results or error`);
        }
      } catch (error) {
        console.log(`❌ ${strategy.name}: Failed`);
      }
    }

    return allProperties;
  }

  // Test different agency contexts
  private async tryAgencyContexts(): Promise<GraphQLProperty[]> {
    console.log(`📡 Testing different agency contexts`);
    const allProperties: GraphQLProperty[] = [];
    const uniqueUIDs = new Set<string>();

    const agencyStrategies = [
      // No agency filter
      { name: 'no-agency', query: 'properties' },
      
      // Different agency parameter names
      { name: 'agencyId', query: `properties(agencyId: "${ENV.AGENCY_UID}")` },
      { name: 'ownerId', query: `properties(ownerId: "${ENV.AGENCY_UID}")` },
      { name: 'organizationId', query: `properties(organizationId: "${ENV.AGENCY_UID}")` },
      
      // Try without any filters but with high limits
      { name: 'global-search', query: 'properties(limit: 200)' },
    ];

    for (const strategy of agencyStrategies) {
      try {
        const query = `{
          ${strategy.query} {
            uid,
            name,
            isActive,
            businessType,
            propertyType,
            availability {
              maxGuests
            },
            address {
              city,
              state
            },
            numberOfSubUnits,
            tags
          }
        }`;
        
        const result = await this.executeQuery(query, `Agency${strategy.name}`);
        if (result && result.length > 0) {
          let newCount = 0;
          result.forEach(prop => {
            if (!uniqueUIDs.has(prop.uid)) {
              uniqueUIDs.add(prop.uid);
              allProperties.push(prop);
              newCount++;
            }
          });
          console.log(`✅ Agency ${strategy.name}: ${result.length} total, ${newCount} new properties`);
        }
      } catch (error) {
        console.log(`❌ Agency ${strategy.name}: Failed`);
      }
    }

    return allProperties;
  }

  // Targeted discovery based on known property patterns
  async discoverMissingUnits(): Promise<GraphQLProperty[]> {
    console.log("🎯 TARGETED DISCOVERY: Finding missing units based on patterns");
    console.log("═".repeat(60));
    
    const allProperties: GraphQLProperty[] = [];
    const uniqueUIDs = new Set<string>();
    
    // Based on your property list, search for specific missing units
    const targetSearches = [
      // Missing 4417 units
      { pattern: "4417-08", desc: "Missing Swiss Avenue unit 08" },
      { pattern: "4417-13", desc: "Possible Swiss Avenue unit 13+" },
      { pattern: "4417-14", desc: "Possible Swiss Avenue unit 14+" },
      { pattern: "4417-15", desc: "Possible Swiss Avenue unit 15+" },
      
      // Missing 4502 units  
      { pattern: "4502-01", desc: "Missing Reiger Avenue unit 01" },
      { pattern: "4502-03", desc: "Possible Reiger Avenue unit 03+" },
      { pattern: "4502-04", desc: "Possible Reiger Avenue unit 04+" },
      
      // Missing 4803 higher floors
      { pattern: "4803-301", desc: "Possible Junius 3rd floor units" },
      { pattern: "4803-302", desc: "Possible Junius 3rd floor units" },
      { pattern: "4803-401", desc: "Possible Junius 4th floor units" },
      
      // Missing 6011 units
      { pattern: "6011-221", desc: "Possible Gaston Avenue unit 221+" },
      { pattern: "6011-219", desc: "Possible Gaston Avenue unit 219-" },
      { pattern: "6011-101", desc: "Possible Gaston Avenue 1st floor" },
      
      // Search by address patterns
      { pattern: "Swiss Avenue", desc: "All Swiss Avenue properties" },
      { pattern: "Junius Street", desc: "All Junius Street properties" },
      { pattern: "Reiger Avenue", desc: "All Reiger Avenue properties" },
      { pattern: "Gaston Avenue", desc: "All Gaston Avenue properties" },
      
      // Search by Dallas neighborhoods
      { pattern: "Lakewood", desc: "Lakewood neighborhood properties" },
      { pattern: "East Dallas", desc: "East Dallas properties" },
      { pattern: "Deep Ellum", desc: "Deep Ellum properties" },
    ];

    for (const search of targetSearches) {
      try {
        console.log(`🔍 Searching: ${search.desc} (${search.pattern})`);
        
        // Try REST API searches since GraphQL name search isn't supported
        const restSearches = [
          { endpoint: "/properties", params: { q: search.pattern } },
          { endpoint: "/properties", params: { search: search.pattern } },
          { endpoint: "/properties", params: { name: search.pattern } },
          { endpoint: "/properties", params: { address: search.pattern } },
          { endpoint: "/properties/search", params: { query: search.pattern } },
        ];

        for (const restSearch of restSearches) {
          try {
            const response = await this.http.get(restSearch.endpoint, {
              params: { 
                agencyUid: ENV.AGENCY_UID, 
                limit: 100,
                ...restSearch.params 
              },
              headers: { 'X-HOSTFULLY-APIKEY': ENV.APIKEY }
            });

            const properties = this.extractProperties(response.data);
            let newCount = 0;
            properties.forEach((prop: any) => {
              if (prop.uid && !uniqueUIDs.has(prop.uid)) {
                uniqueUIDs.add(prop.uid);
                // Convert to GraphQL format
                const convertedProp: GraphQLProperty = {
                  uid: prop.uid,
                  name: prop.name || prop.title || '',
                  isActive: prop.isActive !== false,
                  mainPicture: prop.mainPicture || {},
                  businessType: prop.businessType || '',
                  propertyType: prop.propertyType || '',
                  availability: { maxGuests: prop.maxGuests || prop.availability?.maxGuests || 0 },
                  address: {
                    address: prop.address?.address || '',
                    address2: prop.address?.address2 || '',
                    zipCode: prop.address?.zipCode || '',
                    city: prop.address?.city || '',
                    state: prop.address?.state || ''
                  },
                  subUnits: prop.subUnits || [],
                  numberOfSubUnits: prop.numberOfSubUnits || 0,
                  pricing: { currency: prop.pricing?.currency || 'USD' },
                  tags: prop.tags || []
                };
                allProperties.push(convertedProp);
                newCount++;
              }
            });
            
            if (newCount > 0) {
              console.log(`   ✅ REST ${restSearch.endpoint}: ${newCount} new properties!`);
              break; // Found some, don't need to try other REST methods
            }
          } catch (e) {
            // Expected for many endpoints
          }
        }

      } catch (error) {
        console.log(`   ❌ ${search.pattern}: Search failed`);
      }
    }

    // Try direct UID guessing based on patterns
    await this.guessUIDsFromPatterns(uniqueUIDs, allProperties);

    console.log(`\n🎯 Targeted discovery found: ${allProperties.length} additional properties`);
    return allProperties;
  }

  // Attempt to guess UIDs based on patterns from known UIDs
  private async guessUIDsFromPatterns(knownUIDs: Set<string>, allProperties: GraphQLProperty[]): Promise<void> {
    console.log(`\n🔮 Attempting UID pattern discovery...`);
    
    // Extract patterns from known UIDs
    const knownUIDList = [
      "ac8d730c-2554-4547-986a-dda3bb2a6b62", // 4417-01
      "3fe4130f-a44c-42d1-9132-702af9d66f7c", // 4417-02
      "24b2b422-d78c-4b6c-aa35-7e408cc2f8ae", // 4417-03
    ];

    // Try to find sequential UIDs by checking nearby patterns
    for (const baseUID of knownUIDList.slice(0, 3)) {
      const parts = baseUID.split('-');
      if (parts.length === 5) {
        // Try incrementing/decrementing the last part
        const lastPart = parts[4];
        const lastHex = parseInt(lastPart, 16);
        
        for (let i = -10; i <= 10; i++) {
          if (i === 0) continue;
          
          const newHex = (lastHex + i).toString(16).padStart(lastPart.length, '0');
          const testUID = [...parts.slice(0, 4), newHex].join('-');
          
          if (!knownUIDs.has(testUID)) {
            try {
              const property = await this.getIndividualProperty(testUID);
              if (property) {
                knownUIDs.add(testUID);
                allProperties.push(property);
                console.log(`   🎉 Found via UID pattern: ${testUID} - ${property.name}`);
              }
            } catch (e) {
              // Expected for most attempts
            }
          }
        }
      }
    }
  }

  // Get individual property by UID
  private async getIndividualProperty(uid: string): Promise<GraphQLProperty | null> {
    try {
      const query = `{
        property(uid: "${uid}") {
          uid, name, isActive, businessType, propertyType,
          availability { maxGuests },
          address { address, address2, zipCode, city, state },
          mainPicture { tinyThumbnail, largeThumbnail },
          subUnits { uid, name }, numberOfSubUnits,
          pricing { currency }, tags
        }
      }`;

      const response = await this.http.post('/graphql', {
        operationName: "GetProperty",
        query,
        variables: {}
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-HOSTFULLY-APIKEY': ENV.APIKEY,
        }
      });

      return response.data?.data?.property || null;
    } catch (e) {
      return null;
    }
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