import pandas as pd
import sys

try:
    df = pd.read_excel('data/active_map.xlsx')
    # Search for anything containing 62173 in any column
    found = False
    for col in df.columns:
        matches = df[df[col].astype(str).str.contains('62173', na=False)]
        if not matches.empty:
            print(f"\n--- FOUND IN COLUMN: {col} ---")
            print(matches)
            found = True
    if not found:
        print("\n--- NO MATCHES FOR 62173 ANYWHERE ---")
        
except Exception as e:
    print(f"Error: {e}")
