import pandas as pd
import sys

try:
    df = pd.read_excel('data/active_map.xlsx')
    match = df[df['CPID'].astype(str).str.upper() == 'SBK893']
    if not match.empty:
        print(f"FOUND SBK893 in Excel:")
        print(match[['fName', 'lName', 'CPID']])
    else:
        print("SBK893 NOT FOUND in Excel")
except Exception as e:
    print(f"Error: {e}")
