"""
Vector store module using LangChain Chroma wrapper.
Uses remote HuggingFace Inference API embeddings — low memory footprint for Render.
"""
import os
import httpx
import numpy as np
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma

load_dotenv()

CHROMA_PERSIST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../chroma_db")
)

HF_TOKEN = os.getenv("HUGGINGFACEHUB_API_TOKEN")

class EmbeddingManager:
    """
    Direct-call Embedding Manager inspired by user reference.
    Bypasses library issues by calling HF Inference API directly.
    """
    def __init__(self):
        print("🔗 Initializing Direct HF embedding (e5-small-v2)...")
        self.model_id = "intfloat/e5-small-v2"
        self.api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{self.model_id}"

    def fallback_embedding(self, text):
        print("⚠️ Using fallback embedding (random 384-dim)")
        # e5-small-v2 and MiniLM both use 384 dimensions
        return list(np.random.rand(384).astype(float))

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            headers = {"Authorization": f"Bearer {HF_TOKEN}"}
            response = httpx.post(
                self.api_url, 
                headers=headers, 
                json={"inputs": texts, "options": {"wait_for_model": True}},
                timeout=60.0
            )
            if response.status_code != 200:
                print(f"❌ HF API Error: {response.text}")
                return [self.fallback_embedding(t) for t in texts]
            
            return response.json()
        except Exception as e:
            print(f"❌ Doc embedding failed: {str(e)}")
            return [self.fallback_embedding(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        try:
            # Note: e5 models often require a prefix for queries
            query_text = f"query: {text}"
            res = self.embed_documents([query_text])
            return res[0]
        except Exception as e:
            print(f"❌ Query embedding failed: {str(e)}")
            return self.fallback_embedding(text)

def get_embeddings():
    """Returns the EmbeddingManager instance."""
    return EmbeddingManager()

def get_vectorstore():
    embeddings = get_embeddings()
    db = Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=embeddings
    )
    return db

def store_documents(documents):
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
    db = get_vectorstore()
    retriever = db.as_retriever(
        search_kwargs={
            "k": k,
            "filter": {"meetingId": meeting_id}
        }
    )
    return retriever

def get_all_meeting_documents(meeting_id: str) -> list[str]:
    db = get_vectorstore()
    result = db.get(
        where={"meetingId": meeting_id},
        include=["documents", "metadatas"]
    )
    docs = result.get("documents", [])
    return docs
