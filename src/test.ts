import { HostfullyClient } from './api/hostfullyClient';

async function main() {
  const client = new HostfullyClient();
  console.log('Starting property fetch...');
  
  try {
    const properties = await client.getAllPropertiesWithFallback();
    console.log(`Found ${properties.length} properties`);
    
    // Optional: Save results to file
    const fs = require('fs');
    fs.writeFileSync(
      'properties.json', 
      JSON.stringify(properties, null, 2)
    );
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();