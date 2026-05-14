"""
FastAPI routes for the AI microservice.

Uses LangChain Chroma wrapper (retriever-based RAG) matching the reference project architecture.
Two-path retrieval strategy:
  - Broad queries (summarize, conclude, overview) → ALL chunks for the meeting
  - Specific queries → top-k semantic similarity retrieval
"""
import os
import time
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from pydantic import BaseModel

from app.transcription.whisper import transcribe_audio
from app.chunking.text_splitter import chunk_transcript
from app.chromadb.client import store_documents, get_meeting_retriever, get_all_meeting_documents
from app.llm.groq_client import ask_groq

router = APIRouter()

# Keywords that indicate the user wants a broad, full-meeting response
BROAD_QUERY_KEYWORDS = [
    "summarize", "summary", "overview", "overall",
    "conclude", "conclusion", "conclusions",
    "everything", "all", "entire", "whole",
    "derive", "findings", "key points", "main points",
    "highlight", "highlights", "recap", "review",
    "what happened", "what was discussed", "tell me about",
    "what did", "decisions", "action items", "takeaways"
]


def is_broad_query(question: str) -> bool:
    """Returns True if the question is a broad summarization/overview query."""
    q_lower = question.lower()
    return any(keyword in q_lower for keyword in BROAD_QUERY_KEYWORDS)


class AskRequest(BaseModel):
    meeting_id: str
    question: str


@router.post("/process-audio")
async def process_audio(
    audio: UploadFile = File(...),
    meeting_id: str = Form(...),
    user_id: str = Form(...),
    speaker: str = Form("Speaker")
):
    print(f"[FASTAPI] Received /process-audio request.")
    print(f"[FASTAPI] Params - meeting_id: {meeting_id}, user_id: {user_id}, speaker: {speaker}")
    print(f"[FASTAPI] File - filename: {audio.filename}, content_type: {audio.content_type}")

    try:
        # 1. Read file into memory (no disk writes)
        audio_bytes = await audio.read()
        print(f"[FASTAPI] Read {len(audio_bytes)} bytes from UploadFile into memory.")

        if len(audio_bytes) == 0:
            print("[FASTAPI] ERROR: Received empty audio file.")
            raise HTTPException(status_code=400, detail="Empty audio file received.")

        # 2. Transcribe Audio via Groq Whisper
        print("[FASTAPI] Starting transcription...")
        transcript = transcribe_audio(audio.filename, audio_bytes)
        print(f"[FASTAPI] Transcription complete. Length: {len(transcript)} chars.")

        # 3. Chunk with RecursiveCharacterTextSplitter → LangChain Documents
        documents = chunk_transcript(
            transcript=transcript,
            meeting_id=meeting_id,
            speaker=speaker,
            user_id=user_id
        )
        print(f"[FASTAPI] Generated {len(documents)} document chunks.")

        if documents:
            # 4. Store in Chroma via LangChain (no manual embedding insertion)
            store_documents(documents)
            print("[FASTAPI] Successfully stored vectors in persistent Chroma DB.")

        return {"message": "Audio processed successfully", "text": transcript}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[FASTAPI] ERROR processing audio: {str(e)}.")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask-ai")
async def ask_ai(request: AskRequest):
    print(f"[FASTAPI] Received /ask-ai request for meeting: {request.meeting_id}")
    print(f"[FASTAPI] Question: '{request.question}'")
    try:
        broad = is_broad_query(request.question)
        context = ""

        if broad:
            # PATH A: Full-meeting context — fetch ALL chunks for comprehensive answers
            print("[FASTAPI] Detected BROAD query. Fetching ALL meeting chunks for full context...")
            all_docs = get_all_meeting_documents(meeting_id=request.meeting_id)
            if all_docs:
                context = "\n\n".join(all_docs)
                print(f"[FASTAPI] Full context assembled: {len(all_docs)} chunks, {len(context)} chars.")
            else:
                print("[FASTAPI] No chunks found for this meeting.")
        else:
            # PATH B: Similarity-based retrieval — fetch top-k relevant chunks
            print("[FASTAPI] Detected SPECIFIC query. Using semantic similarity retrieval (k=8)...")
            retriever = get_meeting_retriever(meeting_id=request.meeting_id, k=8)
            docs = retriever.invoke(request.question)
            print(f"[FASTAPI] Retrieved {len(docs)} relevant chunks via similarity search.")
            context = "\n\n".join([doc.page_content for doc in docs]) if docs else ""

        if not context:
            print("[FASTAPI] No context found. Returning empty-context response.")

        # Ask Groq LLM with assembled context
        answer = ask_groq(question=request.question, context=context, is_summary=broad)

        return {"answer": answer}

    except Exception as e:
        print(f"[FASTAPI] ERROR in ask-ai: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
