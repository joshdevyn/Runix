const fs = require('fs');
const path = require('path');

const expectedDrivers = [
  { name: 'ai-driver', critical: true },
  { name: 'system-driver', critical: true },
  { name: 'vision-driver', critical: true },
  { name: 'web-driver', critical: true },
  { name: 'example-driver', critical: false }
];

const driversBasePath = path.join(__dirname, '..', 'bin', 'drivers');
let allCriticalDriversFound = true;
let foundCount = 0;

console.log(`Verifying drivers in: ${driversBasePath}`);

expectedDrivers.forEach(driver => {
  const driverPath = path.join(driversBasePath, driver.name);
  if (fs.existsSync(driverPath)) {
    // Optionally, check for a specific file within the driver folder, e.g., driver.json or an executable
    // For now, just checking the directory existence.
    const manifestPath = path.join(driverPath, 'driver.json');
    if (fs.existsSync(manifestPath)) {
      console.log(`✅ Found driver: ${driver.name} (manifest exists)`);
      foundCount++;
    } else {
      console.log(`⚠️ Found driver directory: ${driver.name}, but driver.json is missing.`);
      if (driver.critical) {
        allCriticalDriversFound = false;
      }
    }
  } else {
    console.error(`❌ Missing driver: ${driver.name}`);
    if (driver.critical) {
      allCriticalDriversFound = false;
    }
  }
});

console.log(`Verification complete. Found ${foundCount}/${expectedDrivers.length} expected drivers.`);

if (!allCriticalDriversFound) {
  console.error('Critical drivers missing. Please check the build process and driver paths.');
  process.exit(1); // Exit with error code
} else {
  console.log('All critical drivers verified successfully.');
  process.exit(0); // Exit with success code
}
