---
name: senator-research-outreach
description: Research US Senator voting records, schedules, background information (including pre-Senate career), and perform constituent outreach. Use when the user needs to track legislative activity, understand a Senator's history, or draft and send professional communications to Senate offices.
---

# Senator Research & Outreach

This skill provides a comprehensive framework for researching and contacting US Senators.

## Core Capabilities

1. **Voting Records:** Access recent and historical roll-call votes.
2. **Schedules:** Track the Senate's tentative annual schedule and daily business.
3. **Background Research:** Discover biographical details, including pre-Senate career (BioGuide, Ballotpedia, Wikipedia).
4. **Outreach:** Draft professional emails using constituent-focused templates.

## Workflows

### 1. Researching a Senator's Profile
- Use `scripts/get_senator_info.py <name>` to get a summary of their career.
- Refer to `references/senator-background-sources.md` for deep dives into their past (e.g., OpenSecrets for lobbying history).
- Search for "pre-Senate career [Senator Name]" to find specific information before they joined the chamber.

### 2. Tracking Voting Records
- **Requirements:** Set the `PROPUBLICA_API_KEY` environment variable.
- **Action:** Run `python scripts/get_senator_votes.py <member_id>`.
- To find a `member_id`, search for the Senator's profile on [ProPublica Congress API](https://projects.propublica.org/api-docs/congress-api/).

### 3. Checking Senate Schedules
- Annual Schedule: [Senate.gov 2026 Schedule](https://www.senate.gov/legislative/2026_schedule.htm)
- Daily Business: [Senate Calendar of Business](https://www.senate.gov/legislative/calendar.htm)

### 4. Drafting Constituent Emails
- Load the template from `assets/senator-email-template.md`.
- Customize with specific bill numbers or issues.
- **Tip:** Always include a physical address to verify constituent status.

## Reference Materials
- [senator-apis.md](references/senator-apis.md) - API endpoints and documentation.
- [senator-background-sources.md](references/senator-background-sources.md) - Definitive biographical sources.

## Best Practices
- **Concise Messaging:** Senate staff process thousands of emails; keep communication focused on one issue.
- **Official Forms:** While templates are useful, many Senators prefer submissions via their official `senate.gov` contact forms. Use the templates to prepare your message before pasting it into the form.
- **Verification:** Cross-reference Wikipedia/Ballotpedia for pre-Senate history as it often provides more granular detail than official biographies.

## Reflect & Learn
- [ ] **Reflect & Learn**: Log task outcome to .memory/ using the self-improvement signal schema.
