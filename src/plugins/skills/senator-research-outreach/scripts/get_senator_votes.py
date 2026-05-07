import os
import sys
import requests
import json

def get_votes(member_id):
    api_key = os.getenv("PROPUBLICA_API_KEY")
    if not api_key:
        print("Error: PROPUBLICA_API_KEY environment variable not set.")
        sys.exit(1)

    url = f"https://api.propublica.org/congress/v1/members/{member_id}/votes.json"
    headers = {"X-API-Key": api_key}

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        votes = data.get("results", [{}])[0].get("votes", [])
        if not votes:
            print(f"No votes found for member {member_id}.")
            return

        print(f"Recent votes for {member_id}:")
        for vote in votes[:10]: # Top 10
            print(f"- {vote['date']} {vote['time']}: {vote['position']} on {vote['description']}")
            print(f"  Result: {vote['result']}")

    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python get_senator_votes.py <member_id>")
        sys.exit(1)
    
    get_votes(sys.argv[1])
