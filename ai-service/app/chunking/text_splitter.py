"""
Text chunking module using LangChain's RecursiveCharacterTextSplitter.
Mirrors reference project configuration: chunk_size=300, chunk_overlap=50.
Operates on plain transcript strings (not PDFs/Documents).
"""
import time
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


def chunk_transcript(transcript: str, meeting_id: str, speaker: str, user_id: str) -> list[Document]:
    """
    Splits a transcript string into LangChain Document chunks with meeting metadata.
    Each chunk includes: meetingId, speaker, userId, timestamp.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,
        chunk_overlap=50
    )

    raw_chunks = splitter.split_text(transcript)
    timestamp = int(time.time())

    documents = [
        Document(
            page_content=chunk,
            metadata={
                "meetingId": meeting_id,
                "speaker": speaker,
                "userId": user_id,
                "timestamp": timestamp
            }
        )
        for chunk in raw_chunks
    ]

    print(f"[FASTAPI] RecursiveCharacterTextSplitter produced {len(documents)} chunks.")
    return documents
