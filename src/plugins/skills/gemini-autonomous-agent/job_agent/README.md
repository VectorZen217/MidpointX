# 🕵️‍♂️ Job Scout Sub-Agent

Job Scout is an autonomous sub-agent designed to find and match remote jobs based on your professional profile.

## How it Works
1. **Analyze Resume**: It extracts skills, roles, and experience from your provided resume.
2. **Search**: It uses advanced search queries to find remote positions on major job boards (LinkedIn, Indeed, Greenhouse, Lever, etc.).
3. **Match**: It scores each job based on your specific skills (Python, SD-WAN, AI Agents) and relevance to your 20+ years of experience.
4. **Report**: It generates a prioritized list of opportunities for you to review.
5. **Notify**: It emails the final report to your configured address.

## Configuration
- `config.json`: Contains your profile, search preferences, and notification email.
- **Environment Variables**: For email functionality, set the following on your system:
  - `EMAIL_USER`: Your Gmail address (e.g., yourname@gmail.com).
  - `EMAIL_PASS`: Your Gmail [App Password](https://myaccount.google.com/apppasswords).

## File Structure
- `config.json`: Contains your profile and search preferences.
- `job_scout.py`: The core logic for scoring, reporting, and emailing.
- `resume_text.txt`: The extracted text from your original resume.
- `run_job_agent.bat`: Wrapper for the scheduled task.
- `jobs/`: Subfolder containing job descriptions and tailored resumes.

## Usage
To run a new scan:
```bash
python job_scout.py
```

## Current Matches (as of Feb 18, 2026)
1. **AI Agent Engineer (Backend)** @ Alva (Remote) - 10/10 Match
2. **AI/ML Engineer** @ fullthrottle.ai (Remote) - 9/10 Match
3. **Senior Network Engineer (SD-WAN)** @ AT&T (Remote) - 8/10 Match
