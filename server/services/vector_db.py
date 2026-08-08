
# services/vector_db.py

import numpy as np

# Fake in-memory "vector database"
# Pretend these are embeddings for CDCR numbers
VECTOR_DB = {
    "A123456": np.array([0.1, 0.2, 0.3]),
    "B789012": np.array([0.2, 0.1, 0.4]),
    "C345678": np.array([0.9, 0.8, 0.7]),
}

def embed_text(text: str) -> np.ndarray:
    """
    Mock embedding function. Converts text to a vector.
    """
    # Simple hash-based mock embedding
    return np.array([ord(c) % 10 / 10 for c in text[:3]])

def search_database(query_vector: np.ndarray, top_k: int = 2) -> list:
    """
    Finds top_k closest CDCR numbers based on cosine similarity.
    """
    def cosine_similarity(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    scores = {
        cdcr: cosine_similarity(query_vector, vec)
        for cdcr, vec in VECTOR_DB.items()
    }

    # Sort by similarity score
    sorted_matches = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [cdcr for cdcr, _ in sorted_matches[:top_k]]