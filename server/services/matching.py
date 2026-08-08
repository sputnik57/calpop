# services/matching.py

import pandas as pd
from services.vector_db import embed_text, search_database

def match_text_to_records(df: pd.DataFrame, extracted_text: str) -> pd.DataFrame:
    """
    Matches extracted text to CDCR numbers using vector similarity.
    """
    query_vector = embed_text(extracted_text)
    matched_ids = search_database(query_vector)
    matches = df[df['CDCRno'].isin(matched_ids)]
    return matches