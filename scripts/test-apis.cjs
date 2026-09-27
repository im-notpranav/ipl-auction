// Keys come from the environment, never from source. Run: node --env-file=.env.local scripts/test-apis.cjs
const CRICKET_API_KEY = process.env.CRICKET_API_KEY || '';
const CRICKET_API_BASE_URL = 'https://api.cricapi.com/v1';
const PLAYER_IMAGE_API_KEY = process.env.PLAYER_IMAGE_API_KEY || '';
const PLAYER_IMAGE_BASE_URL = 'https://api.cricketimages.org/v1';

async function testCricAPI() {
  console.log('=== Testing CricAPI (Sportmonks) ===');
  
  // Test players list
  console.log('\n--- Players list ---');
  try {
    const res = await fetch(`${CRICKET_API_BASE_URL}/players?apikey=${CRICKET_API_KEY}&offset=0`);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Keys:', Object.keys(data));
    if (data.data && Array.isArray(data.data)) {
      console.log('Total players:', data.data.length);
      console.log('First 3:', JSON.stringify(data.data.slice(0, 3), null, 2));
    }
    console.log('Full response (first 3000 chars):', JSON.stringify(data, null, 2).slice(0, 3000));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Test player search for Rohit Sharma
  console.log('\n--- Search: Rohit Sharma ---');
  try {
    const res = await fetch(`${CRICKET_API_BASE_URL}/players?apikey=${CRICKET_API_KEY}&search=Rohit%20Sharma`);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Keys:', Object.keys(data));
    if (data.data && Array.isArray(data.data)) {
      console.log('Results:', data.data.length);
      console.log('Data:', JSON.stringify(data.data, null, 2));
    }
    console.log('Full response:', JSON.stringify(data, null, 2).slice(0, 5000));
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Test player search for Virat Kohli
  console.log('\n--- Search: Virat Kohli ---');
  try {
    const res = await fetch(`${CRICKET_API_BASE_URL}/players?apikey=${CRICKET_API_KEY}&search=Virat%20Kohli`);
    console.log('Status:', res.status);
    const data = await res.json();
    if (data.data && Array.isArray(data.data)) {
      console.log('Results:', data.data.length);
      console.log('Data:', JSON.stringify(data.data, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Test player search for Jasprit Bumrah
  console.log('\n--- Search: Jasprit Bumrah ---');
  try {
    const res = await fetch(`${CRICKET_API_BASE_URL}/players?apikey=${CRICKET_API_KEY}&search=Jasprit%20Bumrah`);
    console.log('Status:', res.status);
    const data = await res.json();
    if (data.data && Array.isArray(data.data)) {
      console.log('Results:', data.data.length);
      console.log('Data:', JSON.stringify(data.data, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

async function testCricwix() {
  console.log('\n\n=== Testing Cricwix (cricketimages.org) ===');
  
  // Test players list
  console.log('\n--- Players list ---');
  try {
    const res = await fetch(`${PLAYER_IMAGE_BASE_URL}/players?apikey=${PLAYER_IMAGE_API_KEY}`);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Keys:', Object.keys(data));
    if (data.data && Array.isArray(data.data)) {
      console.log('Total players:', data.data.length);
      console.log('First 3:', JSON.stringify(data.data.slice(0, 3), null, 2));
    }
    console.log('Full response:', JSON.stringify(data, null, 2).slice(0, 5000));
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Test player search for Rohit Sharma
  console.log('\n--- Search: Rohit Sharma ---');
  try {
    const res = await fetch(`${PLAYER_IMAGE_BASE_URL}/players?apikey=${PLAYER_IMAGE_API_KEY}&search=Rohit%20Sharma`);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Keys:', Object.keys(data));
    if (data.data && Array.isArray(data.data)) {
      console.log('Results:', data.data.length);
      console.log('Data:', JSON.stringify(data.data, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Test player search for Virat Kohli
  console.log('\n--- Search: Virat Kohli ---');
  try {
    const res = await fetch(`${PLAYER_IMAGE_BASE_URL}/players?apikey=${PLAYER_IMAGE_API_KEY}&search=Virat%20Kohli`);
    console.log('Status:', res.status);
    const data = await res.json();
    if (data.data && Array.isArray(data.data)) {
      console.log('Results:', data.data.length);
      console.log('Data:', JSON.stringify(data.data, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Test player search for Jasprit Bumrah
  console.log('\n--- Search: Jasprit Bumrah ---');
  try {
    const res = await fetch(`${PLAYER_IMAGE_BASE_URL}/players?apikey=${PLAYER_IMAGE_API_KEY}&search=Jasprit%20Bumrah`);
    console.log('Status:', res.status);
    const data = await res.json();
    if (data.data && Array.isArray(data.data)) {
      console.log('Results:', data.data.length);
      console.log('Data:', JSON.stringify(data.data, null, 2));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

async function testSportmonksCDN() {
  console.log('\n\n=== Testing Sportmonks CDN (public) ===');
  
  // Test known player IDs from CDN
  const testIds = ['14/46', '14/47', '14/48', '14/49', '14/50'];
  for (const id of testIds) {
    try {
      const res = await fetch(`https://cdn.sportmonks.com/images/cricket/players/${id}.png`);
      console.log(`ID ${id}: Status ${res.status}, Content-Type: ${res.headers.get('content-type')}`);
    } catch (e) {
      console.log(`ID ${id}: Error - ${e.message}`);
    }
  }
}

async function main() {
  await testCricAPI();
  await testCricwix();
  await testSportmonksCDN();
}

main();