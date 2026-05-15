"""
Vector store module using LangChain Chroma wrapper.
Uses direct HuggingFace Inference API calls for a minimal memory footprint.
"""
import os
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEndpointEmbeddings

load_dotenv()

CHROMA_PERSIST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../chroma_db")
)
COLLECTION_NAME = "nexus_meetings"

print(f"[FASTAPI] ChromaDB will persist at: {CHROMA_PERSIST_DIR} (Collection: {COLLECTION_NAME})")


def get_embeddings():
    """Returns remote HuggingFace embeddings via Inference API (all-MiniLM-L6-v2)."""
    print("[FASTAPI] Using remote HuggingFace Inference API: all-MiniLM-L6-v2...")
    return HuggingFaceEndpointEmbeddings(
        model="sentence-transformers/all-MiniLM-L6-v2",
        huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN")
    )


def get_vectorstore():
    """
    Returns a LangChain Chroma vectorstore backed by local persistent storage.
    """
    embeddings = get_embeddings()
    db = Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=embeddings,
        collection_name=COLLECTION_NAME
    )
    return db


def store_documents(documents):
    """
    Adds a list of LangChain Document objects to the persistent Chroma vectorstore.
    """
    print(f"[FASTAPI] Storing {len(documents)} document chunks in Chroma...")
    embeddings = get_embeddings()
    db = Chroma.from_documents(
        documents=documents,
        embedding=embeddings,
        persist_directory=CHROMA_PERSIST_DIR,
        collection_name=COLLECTION_NAME
    )
    print(f"[FASTAPI] Chroma vectorstore updated and persisted. Total count: {db._collection.count()}")
    return db


def get_meeting_retriever(meeting_id: str, k: int = 8):
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
    db = get_vectorstore()
    # Use Chroma's .get() method to retrieve all chunks with this meetingId filter
    result = db.get(
        where={"meetingId": meeting_id},
        include=["documents", "metadatas"]
    )
    docs = result.get("documents", [])
    print(f"[FASTAPI] Full-context retrieval: found {len(docs)} total chunks for meetingId: {meeting_id}")
    return docs
