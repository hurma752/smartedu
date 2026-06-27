# app/rag/embeddings.py
# This module's only job: convert text into vectors (embeddings)

from sentence_transformers import SentenceTransformer
from app.config import settings

# Load the embedding model once when the module is imported
# Loading takes ~2-3 seconds, so we do it once and reuse
# "all-MiniLM-L6-v2" converts text into 384-dimensional vectors
print(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Convert a list of text strings into a list of vectors.
    
    Example:
        Input:  ["What is an OS?", "Memory management explained"]
        Output: [[0.23, -0.11, ...384 numbers], [0.45, 0.02, ...384 numbers]]
    """
    # encode() does the actual conversion
    # tolist() converts from numpy arrays to regular Python lists
    return embedding_model.encode(texts, show_progress_bar=False).tolist()

def get_single_embedding(text: str) -> list[float]:
    """
    Convenience function for embedding a single string.
    Used when embedding a user's question.
    """
    return embedding_model.encode([text]).tolist()[0]