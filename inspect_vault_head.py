import pandas as pd
import sys

try:
    df = pd.read_excel('data/active_map.xlsx')
    print("--- FIRST 5 RECORDS ---")
    print(df[['fName', 'lName', 'CDCRno', 'CPID']].head(5))
except Exception as e:
    print(f"Error: {e}")
