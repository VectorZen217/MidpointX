# 📋 PLANNER AGENT

# Implementation Plan: Google Sheets Integration for Job Results

## ## Approach
- **Why this solution**: Writing to a Google Sheet provides a centralized, persistent, and easily shareable log of all job matches, complementing the local file storage. `gspread` is the most straightforward Python library for this purpose.
- **Alternatives considered**: 
    - *Direct Google API*: More complex to set up; `gspread` provides a cleaner abstraction.
    - *CSV Export to Drive*: Requires multiple API steps (create CSV, upload, convert); direct sheet writing is more efficient for incremental logging.

## ## Steps
1. **Install Dependencies** (5 min)
   ```bash
   pip install gspread oauth2client
   ```

2. **Google Sheets API Setup** (10 min)
   - Enable Google Sheets and Google Drive APIs in Google Cloud Console.
   - Create a Service Account and download the `service_account.json`.
   - Create a Google Sheet and share it with the service account's email address.

3. **Core Implementation** (30 min)
   - **File to modify**: `job_scout.py`
   - **Logic Updates**:
     - Add `import gspread` and `from oauth2client.service_account import ServiceAccountCredentials`.
     - Implement `log_to_sheets(results)` method in the `JobScout` class.
     - Add Google Sheets configuration (Sheet ID, Credentials path) to `config.json`.

   ```python
   def log_to_sheets(self, results):
       scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
       creds = ServiceAccountCredentials.from_json_keyfile_name(self.search_params['google_creds'], scope)
       client = gspread.authorize(creds)
       sheet = client.open_by_key(self.search_params['google_sheet_id']).sheet1
       
       timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
       for res in results:
           row = [timestamp, res['title'], res['company'], res['score'], res['reason'], res['url']]
           sheet.append_row(row)
   ```

4. **Integration** (10 min)
   - Call `self.log_to_sheets(results)` inside the `run_scout` or `save_to_files` logic.
   - Update `config.json` with the new fields.

5. **Testing** (15 min)
   - Run the script with mock or live results and verify the sheet is updated correctly.
   - Ensure local file creation still works as expected.

## ## Timeline
| Phase | Duration |
|-------|----------|
| Dependencies | 5 min |
| API/Sheet Setup | 10 min |
| Implementation | 30 min |
| Integration | 10 min |
| Testing | 15 min |
| **Total** | **~1 hour 10 min** |

## ## Rollback Plan
1. Revert `job_scout.py` and `config.json` to previous versions.
2. The Google Sheet will remain; it can be manually cleared if needed.

## ## Security Checklist
- [x] Service Account JSON MUST be excluded from Git (add to `.gitignore`).
- [x] Input validation (Ensure URLs and strings are correctly formatted for sheets).
- [x] Auth checks (Verify sheet accessibility before writing).
