"""
Vector store module using LangChain Chroma wrapper.
Uses direct HuggingFace Inference API calls for a minimal memory footprint.
"""
import os
import requests
import time
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_core.embeddings import Embeddings

load_dotenv()

CHROMA_PERSIST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../chroma_db")
)
COLLECTION_NAME = "nexus_meetings"

class LightweightHFEmbeddings(Embeddings):
    """
    Custom LangChain Embeddings class that uses direct HTTP requests to Hugging Face.
    Avoids loading heavy libraries like torch/transformers to save RAM on Render.
    """
    def __init__(self):
        self.model_id = "sentence-transformers/all-MiniLM-L6-v2"
        self.api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{self.model_id}"
        self.api_token = os.getenv("HUGGINGFACEHUB_API_TOKEN")
        self.headers = {"Authorization": f"Bearer {self.api_token}"}

    def _embed(self, texts):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    self.api_url,
                    headers=self.headers,
                    json={"inputs": texts, "options": {"wait_for_model": True}},
                    timeout=30
                )
                if response.status_code == 200:
                    data = response.json()
                    # Validate that we got a list of embeddings
                    if isinstance(data, list) and len(data) > 0:
                        return data
                    print(f"[FASTAPI] Unexpected HF API response format: {type(data)}")
                elif response.status_code == 401 or response.status_code == 403:
                    print(f"[FASTAPI] AUTH ERROR: Check your HUGGINGFACEHUB_API_TOKEN permissions.")
                    break
                else:
                    print(f"[FASTAPI] HF API Error {response.status_code}: {response.text}")
            except Exception as e:
                print(f"[FASTAPI] Attempt {attempt+1} failed: {str(e)}")
            time.sleep(1)
        return None

    def embed_documents(self, texts):
        return self._embed(texts) or [[0.0] * 384] * len(texts)

    def embed_query(self, text):
        res = self._embed([text])
        return res[0] if res else [0.0] * 384

def get_embeddings():
    return LightweightHFEmbeddings()

def get_vectorstore():
    return Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=get_embeddings(),
        collection_name=COLLECTION_NAME
    )

def store_documents(documents):
    try:
        print(f"[FASTAPI] Storing {len(documents)} chunks in Chroma...")
        db = Chroma.from_documents(
            documents=documents,
            embedding=get_embeddings(),
            persist_directory=CHROMA_PERSIST_DIR,
            collection_name=COLLECTION_NAME
        )
        print(f"[FASTAPI] Stored. Total collection count: {db._collection.count()}")
        return db
    except Exception as e:
        print(f"[FASTAPI] CRITICAL ERROR in store_documents: {str(e)}")
        raise e

def get_meeting_retriever(meeting_id: str, k: int = 8):
    db = get_vectorstore()
    # Ensure filter uses 'meetingId' metadata key
    return db.as_retriever(search_kwargs={"k": k, "filter": {"meetingId": meeting_id}})

def get_all_meeting_documents(meeting_id: str) -> list[str]:
    db = get_vectorstore()
    result = db.get(where={"meetingId": meeting_id}, include=["documents"])
    return result.get("documents", [])
