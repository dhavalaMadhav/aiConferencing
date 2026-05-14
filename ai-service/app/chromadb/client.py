"""
Vector store module using LangChain Chroma wrapper.
Uses local HuggingFace embeddings (sentence-transformers) — no API key required.
"""
import os
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

CHROMA_PERSIST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../chroma_db")
)

print(f"[FASTAPI] ChromaDB will persist at: {CHROMA_PERSIST_DIR}")


def get_embeddings():
    """Returns local HuggingFace embeddings (all-MiniLM-L6-v2) via sentence-transformers."""
    print("[FASTAPI] Loading local embedding model: all-MiniLM-L6-v2...")
    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


def get_vectorstore():
    """
    Returns a LangChain Chroma vectorstore backed by local persistent storage.
    Matches the reference project's get_vectorstore() pattern exactly.
    """
    embeddings = get_embeddings()
    db = Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=embeddings
    )
    return db


def store_documents(documents):
    """
    Adds a list of LangChain Document objects to the persistent Chroma vectorstore.
    Each Document must have metadata containing: meetingId, speaker, timestamp.
    """
    print(f"[FASTAPI] Storing {len(documents)} document chunks in Chroma...")
    embeddings = get_embeddings()
    db = Chroma.from_documents(
        documents=documents,
        embedding=embeddings,
        persist_directory=CHROMA_PERSIST_DIR
    )
    print("[FASTAPI] Chroma vectorstore updated and persisted.")
    return db


def get_meeting_retriever(meeting_id: str, k: int = 8):
    """
    Returns a LangChain retriever filtered strictly to the given meetingId.
    Used for specific factual questions (similarity-based retrieval).
    """
    db = get_vectorstore()
    retriever = db.as_retriever(
        search_kwargs={
            "k": k,
            "filter": {"meetingId": meeting_id}
        }
    )
    print(f"[FASTAPI] Similarity retriever created for meetingId: {meeting_id} (k={k})")
    return retriever


def get_all_meeting_documents(meeting_id: str) -> list[str]:
    """
    Fetches ALL stored transcript chunks for a meeting directly from ChromaDB.
    Used for broad summarization/conclusion queries where we need full context,
    not just the top-k semantically similar chunks.
    """
    db = get_vectorstore()
    # Use Chroma's .get() method to retrieve all chunks with this meetingId filter
    result = db.get(
        where={"meetingId": meeting_id},
        include=["documents", "metadatas"]
    )
    docs = result.get("documents", [])
    print(f"[FASTAPI] Full-context retrieval: found {len(docs)} total chunks for meetingId: {meeting_id}")
    return docs
