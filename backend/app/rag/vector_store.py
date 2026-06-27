# app/rag/vector_store.py
"""
ChromaDB interface — one collection per course, chunks tagged with metadata
so we can delete a single document's chunks without touching others.
"""

import uuid
import chromadb
from app.config import settings

# Create ONE client for the whole app's lifetime, not one per function call.
# A new PersistentClient() on every call is the #1 cause of "stale data"
# symptoms in ChromaDB apps — different client instances can end up with
# inconsistent views of what's on disk until they're reopened.
_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)


def get_or_create_collection(course_id: int):
    collection_name = f"course_{course_id}"
    return _client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks_to_collection(course_id: int, document_id: int, chunks: list[dict]) -> int:
    """
    chunks: list of {"text": str, "embedding": list[float]}

    THE FIX: chunk IDs use uuid4, guaranteeing global uniqueness.
    Previously, IDs were built as f"doc_{document_id}_chunk_{i}" — if the
    same document_id was ever reused (e.g. after a failed/retried upload,
    or a bug elsewhere assigning the same ID twice), chunk_0 of PDF #2
    would have the exact same ID as chunk_0 of PDF #1, and ChromaDB's
    .add() silently UPSERTS on duplicate ID — no error, no warning,
    just overwritten data. This is almost certainly what caused PDF #2
    to "disappear" after a clean-looking ingestion.

    Metadata {document_id, course_id, chunk_index} is what makes
    targeted deletion possible later.
    """
    collection = get_or_create_collection(course_id)

    ids = [str(uuid.uuid4()) for _ in chunks]
    texts = [c["text"] for c in chunks]
    embeddings = [c["embedding"] for c in chunks]
    metadatas = [
        {
            "document_id": document_id,
            "course_id": course_id,
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(chunks)


def search_similar_chunks(
    course_id: int, query_embedding: list[float], n_results: int = 4,
    max_distance: float = 0.8,
) -> list[str]:
    """
    max_distance filters out weak matches. ChromaDB with cosine space
    returns a distance where 0 = identical, 2 = opposite. Empirically,
    anything above ~0.8 is usually unrelated content sneaking in just
    because we asked for top-4 regardless of quality.

    This directly helps "incomplete answers" — previously, low-relevance
    chunks diluted the context, pushing the LLM to hedge or go vague
    because it was given some noise mixed with signal.
    """
    collection = get_or_create_collection(course_id)

    if collection.count() == 0:
        return []

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),
        include=["documents", "distances"],
    )

    documents = results["documents"][0]
    distances = results["distances"][0]

    # Keep only chunks under the distance threshold
    filtered = [doc for doc, dist in zip(documents, distances) if dist <= max_distance]

    # Fallback: if filtering removed everything, return the single best
    # match anyway rather than telling the student "nothing found" when
    # there WAS a top candidate, just not a great one
    if not filtered and documents:
        return [documents[0]]

    return filtered


def delete_document_chunks(course_id: int, document_id: int) -> int:
    """
    THE DELETION FIX: delete by metadata filter, not by guessing IDs.

    `where={"document_id": document_id}` tells ChromaDB "delete every
    chunk whose metadata.document_id matches this value" — regardless
    of what its random UUID is. This is why we attached that metadata
    in add_chunks_to_collection above; without it, there would be no
    way to find which vectors belong to which document.
    """
    collection = get_or_create_collection(course_id)

    # Find out how many will be deleted first, for an accurate return count
    # (ChromaDB's delete() doesn't return a count itself)
    matching = collection.get(where={"document_id": document_id})
    count = len(matching["ids"])

    if count > 0:
        collection.delete(where={"document_id": document_id})

    return count


def delete_course_collection(course_id: int):
    """Used when an entire course is deleted — drops the whole collection."""
    try:
        _client.delete_collection(name=f"course_{course_id}")
    except Exception:
        pass  # collection may not exist yet, which is fine