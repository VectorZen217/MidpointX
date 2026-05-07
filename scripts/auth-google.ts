import fs from 'fs';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.join(process.cwd(), 'src', 'plugins', 'mcp', 'google_creds.json');
const GOOGLE_TOKEN_PATH = path.join(process.cwd(), 'src', 'plugins', 'mcp', 'google_token.json');
const GMAIL_TOKEN_PATH = path.join(process.cwd(), 'src', 'plugins', 'mcp', 'gmail_token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar'
];

async function runAuth() {
  console.log('🚀 Starting Unified Google Authentication...');
  
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('❌ Credentials file not found at:', CREDENTIALS_PATH);
    process.exit(1);
  }

  try {
    const client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });

    if (client.credentials) {
      const tokenContent = JSON.stringify(client.credentials, null, 2);
      
      // Save for Drive, Gmail, and Calendar MCP servers
      fs.writeFileSync(GOOGLE_TOKEN_PATH, tokenContent);
      fs.writeFileSync(GMAIL_TOKEN_PATH, tokenContent);
      const CALENDAR_TOKEN_PATH = path.join(process.cwd(), 'src', 'plugins', 'mcp', 'mcp-google-calendar-token.json');
      fs.writeFileSync(CALENDAR_TOKEN_PATH, tokenContent);
      
      console.log('✅ Authentication Successful!');
      console.log('📄 Drive Token saved to:', GOOGLE_TOKEN_PATH);
      console.log('📄 Gmail Token saved to:', GMAIL_TOKEN_PATH);
      console.log('📄 Calendar Token saved to:', CALENDAR_TOKEN_PATH);
      console.log('\nNow restart MidpointX and both services should be connected.');
    }
  } catch (err: any) {
    console.error('❌ Authentication failed:', err.message);
  }
}

runAuth();
