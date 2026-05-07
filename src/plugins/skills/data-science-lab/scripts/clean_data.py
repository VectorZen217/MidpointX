import pandas as pd

def profile_and_clean(csv_path):
    df = pd.read_csv(csv_path)
    report = {
        "rows": len(df),
        "columns": list(df.columns),
        "missing_values": df.isnull().sum().to_dict(),
        "outliers_detected": 0 # Placeholder for heuristic
    }
    
    # Simple cleaning: fill missing values with mean for numeric columns
    for col in df.select_dtypes(include=['number']).columns:
        if df[col].isnull().any():
            df[col] = df[col].fillna(df[col].mean())
            
    df.to_csv(csv_path.replace('.csv', '_cleaned.csv'), index=False)
    return report

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python clean_data.py <csv_path>")
        sys.exit(1)
    
    result = profile_and_clean(sys.argv[1])
    print(json.dumps(result, indent=2))
