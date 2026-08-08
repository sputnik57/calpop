  
import pandas as pd
from datetime import datetime
import pytz


def save_data(df: pd.DataFrame, path: str = None) -> None:
    """
    Save updated prisoner data to Excel with a timestamped filename.
    """
    if path is None:
        # Get current time in Pacific Time
        pacific_tz = pytz.timezone('US/Pacific')
        current_time = datetime.now(pacific_tz)
        
        # Format the timestamp as DDMMMYYYY_HHMM
        timestamp = current_time.strftime("%d%b%Y_%H%M")
        
        # Create the filename with the timestamp in the parent directory. NEEDS CHANGING
        path = f"../prisoner_{timestamp}.xlsx"
    
    df.to_excel(path, index=False)
