import sys
sys.path.insert(0, r'd:\midpointx\venv\lib\site-packages')
from google_auth_oauthlib.flow import InstalledAppFlow
import json

SCOPES = [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/docs',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/presentations',
]
flow = InstalledAppFlow.from_client_secrets_file(
    './client_secret_825222931765-imv1bqrl49799rtnhfdcav57ej8f3pll.apps.googleusercontent.com.json', SCOPES)
creds = flow.run_local_server(port=0)
print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
print(f"GOOGLE_CLIENT_ID={creds.client_id}")
print(f"GOOGLE_CLIENT_SECRET={creds.client_secret}")