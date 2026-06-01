#!/usr/bin/env node
/**
 * One-time setup: obtain GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN for personal Gmail Drive uploads.
 *
 * Prerequisites (Google Cloud Console, same project as Drive API):
 * 1. APIs & Services → Credentials → Create OAuth client ID → "Web application"
 * 2. Authorized redirect URI: http://localhost:3333/oauth2callback
 * 3. OAuth consent screen: add your Gmail as a test user (if app is in Testing)
 *
 * Run from repo root:
 *   GOOGLE_DRIVE_OAUTH_CLIENT_ID=xxx GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=yyy node scripts/google-drive-oauth-setup.mjs
 */
import http from 'http';
import { google } from 'googleapis';

const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim();
const redirectUri =
  process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim() || 'http://localhost:3333/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_DRIVE_OAUTH_CLIENT_ID and GOOGLE_DRIVE_OAUTH_CLIENT_SECRET');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost:3333');
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code');
      return;
    }

    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Success</h1><p>You can close this tab and return to the terminal.</p>');
    server.close();

    console.log('\nAdd these to apps/api/.env on your PC and VPS:\n');
    console.log(`GOOGLE_DRIVE_OAUTH_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_DRIVE_OAUTH_REDIRECT_URI=${redirectUri}`);
    if (tokens.refresh_token) {
      console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      console.warn('No refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and run again with prompt=consent.');
    }
    console.log(`\nGOOGLE_DRIVE_ROOT_FOLDER_ID=your_folder_id_from_drive_url`);
    console.log('\nYou can remove GOOGLE_DRIVE_CREDENTIALS (service account) if using OAuth only.\n');
  } catch (err) {
    res.writeHead(500);
    res.end('Token exchange failed');
    console.error(err);
    process.exit(1);
  }
});

server.listen(3333, () => {
  console.log('Open this URL in a browser (log in as vbdigitalworld1@gmail.com or your Drive owner account):\n');
  console.log(authUrl);
  console.log('\nWaiting for redirect on http://localhost:3333/oauth2callback ...\n');
});
