import sys
import requests

def get_wiki_summary(senator_name):
    # Search for the page title first
    search_url = "https://en.wikipedia.org/w/api.php"
    search_params = {
        "action": "query",
        "list": "search",
        "srsearch": f"{senator_name} US Senator",
        "format": "json"
    }
    
    try:
        search_res = requests.get(search_url, params=search_params)
        search_res.raise_for_status()
        search_data = search_res.json()
        
        if not search_data["query"]["search"]:
            print(f"No Wikipedia entry found for '{senator_name}'.")
            return
            
        page_title = search_data["query"]["search"][0]["title"]
        
        # Get the summary
        extract_params = {
            "action": "query",
            "prop": "extracts",
            "exintro": True,
            "explaintext": True,
            "titles": page_title,
            "format": "json"
        }
        
        extract_res = requests.get(search_url, params=extract_params)
        extract_res.raise_for_status()
        extract_data = extract_res.json()
        
        pages = extract_data["query"]["pages"]
        for page_id in pages:
            summary = pages[page_id]["extract"]
            print(f"--- Information for {page_title} ---")
            print(summary)
            
    except Exception as e:
        print(f"Error fetching Wikipedia data: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python get_senator_info.py <senator_name>")
        sys.exit(1)
        
    get_wiki_summary(" ".join(sys.argv[1:]))
