import pandas as pd
import sys

try:
    df = pd.read_excel('data/active_map.xlsx')
    print(f"Total Rows: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    
    # Check specifically for X99999
    target = df[df['CDCRno'].astype(str).str.contains('X99999', na=False)]
    if not target.empty:
        row = target.iloc[0]
        print("\n--- FOUND RECORD ---")
        for col in df.columns:
            print(f"{col}: {row[col]}")
    else:
        print("\n--- X99999 NOT FOUND IN CDCRno COLUMN ---")
        # Try searching CPID just in case
        cpid_col = 'CPID' if 'CPID' in df.columns else 'code'
        target_cpid = df[df[cpid_col].astype(str).str.contains('X99999', na=False)]
        if not target_cpid.empty:
            print("\n--- FOUND X99999 IN CPID/CODE COLUMN INSTEAD ---")
            row = target_cpid.iloc[0]
            for col in df.columns:
                print(f"{col}: {row[col]}")
        else:
            print("\n--- X99999 NOT FOUND IN CPID/CODE EITHER ---")
            
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
