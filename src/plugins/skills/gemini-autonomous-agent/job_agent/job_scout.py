import json
import os
import sys
import smtplib
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class JobScout:
    def __init__(self, config_path):
        with open(config_path, 'r') as f:
            self.config = json.load(f)
        self.profile = self.config['user_profile']
        self.search_params = self.config['search_params']
        
        # Load base resume
        resume_path = os.path.join(os.path.dirname(__file__), "resume_text.txt")
        if os.path.exists(resume_path):
            with open(resume_path, 'r') as f:
                self.base_resume = f.read()
        else:
            self.base_resume = "Resume content not found."

    def send_email(self, report_content):
        target_email = self.search_params.get("notification_email")
        if not target_email:
            print("No notification email found in config.json. Skipping email.")
            return

        sender_user = os.getenv("EMAIL_USER")
        sender_pass = os.getenv("EMAIL_PASS")

        if not sender_user or not sender_pass:
            print("EMAIL_USER or EMAIL_PASS environment variables not set. Skipping email.")
            return

        print(f"Sending email report to {target_email}...")
        
        msg = MIMEMultipart()
        msg['From'] = sender_user
        msg['To'] = target_email
        msg['Subject'] = f"🚀 New Job Scout Report - {self.profile['name']}"

        msg.attach(MIMEText(report_content, 'plain'))

        try:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(sender_user, sender_pass)
            server.send_message(msg)
            server.quit()
            print("Email sent successfully!")
        except Exception as e:
            print(f"Failed to send email: {e}")

    def log_to_sheets(self, results):
        sheet_id = self.search_params.get("google_sheet_id")
        creds_file = self.search_params.get("google_creds")

        if not sheet_id or sheet_id == "YOUR_GOOGLE_SHEET_ID_HERE":
            print("Google Sheet ID not configured. Skipping sheets log.")
            return

        if not os.path.exists(creds_file):
            print(f"Credentials file {creds_file} not found. Skipping sheets log.")
            return

        print(f"Logging {len(results)} results to Google Sheets...")
        
        try:
            scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
            creds = ServiceAccountCredentials.from_json_keyfile_name(creds_file, scope)
            client = gspread.authorize(creds)
            sheet = client.open_by_key(sheet_id).sheet1
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            for res in results:
                row = [timestamp, res['title'], res['company'], res['score'], res['reason'], res['url']]
                sheet.append_row(row)
            print("Successfully logged to Google Sheets!")
        except Exception as e:
            print(f"Failed to log to Google Sheets: {e}")

    def tailor_resume(self, job_title, matches):
        # Simple tailoring logic: Add a 'Highlighted Skills for this Role' section at the top
        # and ensure the most relevant matches are prominent.
        tailored = f"RELEVANT RESUME FOR: {job_title}\n"
        tailored += "=" * (20 + len(job_title)) + "\n\n"
        tailored += "HIGHLIGHTED MATCHING SKILLS:\n"
        tailored += ", ".join(matches) + "\n\n"
        tailored += self.base_resume
        return tailored

    def generate_queries(self):
        queries = []
        for board in self.search_params.get('job_boards', []):
            for keyword in self.search_params['keywords']:
                for location in self.search_params['locations']:
                    query = f'site:{board.lower()}.com "{location}" "{keyword}"'
                    queries.append(query)
        return queries

    def score_job(self, job_title, job_description):
        score = 0
        matches = []
        
        # Title match
        for role in self.profile['roles']:
            if role.lower() in job_title.lower():
                score += 3
                matches.append(role)
                break
        
        # Skills match
        for skill in self.profile['skills']:
            if skill.lower() in job_description.lower():
                score += 1
                matches.append(skill)
        
        # Remote check
        if "remote" in job_description.lower() or "remote" in job_title.lower():
            score += 2
            
        return min(10, score), matches

    def run_scout(self, raw_results):
        processed = []
        for item in raw_results:
            score, matches = self.score_job(item['title'], item['description'])
            processed.append({
                "title": item['title'],
                "company": item['company'],
                "url": item['url'],
                "score": score,
                "reason": f"Matches: {', '.join(matches)}"
            })
        
        # Sort by score descending
        processed.sort(key=lambda x: x['score'], reverse=True)
        return processed

    def report(self, results):
        output = f"# 🚀 Job Scout Report for {self.profile['name']}\n\n"
        output += "Found the following remote matches based on your resume:\n\n"
        for i, res in enumerate(results[:5]): # Top 5
            output += f"### {i+1}. {res['title']} @ {res['company']}\n"
            output += f"- **Score:** {res['score']}/10\n"
            output += f"- **Match Details:** {res['reason']}\n"
            output += f"- **Apply Link:** {res['url']}\n\n"
        return output

    def save_to_files(self, results):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        local_jobs_dir = os.path.join(os.path.dirname(__file__), "jobs")
        external_jobs_dir = "C:\\Jobs"
        
        output_dirs = [local_jobs_dir, external_jobs_dir]
        
        for jobs_dir in output_dirs:
            if not os.path.exists(jobs_dir):
                try:
                    os.makedirs(jobs_dir)
                except Exception as e:
                    print(f"Could not create directory {jobs_dir}: {e}")
                    continue
                
            for i, res in enumerate(results):
                # Create a safe base filename
                safe_title = "".join([c for c in res['title'] if c.isalnum() or c in (' ', '-', '_')]).rstrip()
                base_filename = f"job_{i+1}_{safe_title.replace(' ', '_')}_{timestamp}"
                
                # Save Job Description
                filepath = os.path.join(jobs_dir, f"{base_filename}.md")
                content = f"# {res['title']} @ {res['company']}\n\n"
                content += f"- **Score:** {res['score']}/10\n"
                content += f"- **Match Details:** {res['reason']}\n"
                content += f"- **Apply Link:** {res['url']}\n"
                
                with open(filepath, 'w') as f:
                    f.write(content)
                
                # Save Tailored Resume
                # Extract matches list from the reason string
                match_list = res['reason'].replace("Matches: ", "").split(", ")
                resume_content = self.tailor_resume(res['title'], match_list)
                resume_filepath = os.path.join(jobs_dir, f"{base_filename}_resume.txt")
                with open(resume_filepath, 'w') as f:
                    f.write(resume_content)

if __name__ == "__main__":
    # Example usage for testing
    scout = JobScout("config.json")
    # Mock data based on search
    mock_data = [
        {
            "title": "AI Agent Engineer",
            "company": "Dark Matter Therapeutics",
            "url": "https://www.indeed.com/viewjob?jk=...",
            "description": "Building AI agents using Python, LangChain, and API integrations. Remote role."
        },
        {
            "title": "Senior Network Engineer (SD-WAN)",
            "company": "AT&T",
            "url": "https://www.linkedin.com/jobs/view/...",
            "description": "Architecting SD-WAN networks with Zero Trust security. Senior level."
        },
        {
            "title": "Python AI Developer",
            "company": "Vikara.AI",
            "url": "https://lever.co/vikara/job/...",
            "description": "Develop AI automations and agents with Python and JSON APIs. Remote."
        }
    ]
    results = scout.run_scout(mock_data)
    report_content = scout.report(results)
    print(report_content)
    scout.save_to_files(results)
    scout.log_to_sheets(results)
    scout.send_email(report_content)
