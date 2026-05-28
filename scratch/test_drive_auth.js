
const { google } = require('googleapis');
require('dotenv').config({ path: 'apps/api/.env' });

async function testDrive() {
  const credentialsStr = process.env.GOOGLE_DRIVE_CREDENTIALS;
  if (!credentialsStr) {
    console.error('GOOGLE_DRIVE_CREDENTIALS not found in .env');
    return;
  }

  try {
    const credentials = JSON.parse(credentialsStr);
    
    // Fix for private key newlines
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    console.log('Attempting to get access token...');
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    console.log('Successfully obtained token!');
    console.log('Token:', token.token.substring(0, 10) + '...');
  } catch (error) {
    console.error('Error during auth test:');
    if (error.response && error.response.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testDrive();
