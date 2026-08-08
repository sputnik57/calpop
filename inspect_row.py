import pandas as pd
import sys

try:
    df = pd.read_excel('data/active_map.xlsx')
    row = df.iloc[1]
    print("--- ROW 1 DETAILS ---")
    for col in df.columns:
        print(f"{col}: {row[col]} (Type: {type(row[col])})")
except Exception as e:
    print(f"Error: {e}")
