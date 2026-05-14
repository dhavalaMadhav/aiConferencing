"""
LLM client using langchain-groq.
Distinct system prompts for summarization vs specific queries.
"""
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

llm = ChatGroq(
    groq_api_key=GROQ_API_KEY,
    model_name="llama-3.1-8b-instant",
    temperature=0.3
)


def ask_groq(question: str, context: str, is_summary: bool = False) -> str:
    """
    Asks the Groq LLM a question based strictly on the provided meeting context.
    Uses a rich summarization prompt for broad queries and a focused
    factual prompt for specific questions.
    """
    if not context.strip():
        return "I cannot answer this — no transcript data was found for this meeting. Please ensure the meeting audio has been processed first."

    if is_summary:
        # Comprehensive summarization prompt — used when full meeting context is provided
        prompt = f"""You are an expert AI meeting analyst. You have been given the complete transcript of a meeting.

Your task is to provide a thorough, well-structured response to the user's request.

When summarizing or deriving conclusions:
- Cover ALL major topics discussed
- List ALL key decisions made
- Extract ALL action items and who is responsible
- Identify ALL important conclusions
- Note any open questions or unresolved points
- Be thorough and comprehensive — do NOT leave out important details

Complete Meeting Transcript:
{context}

User Request:
{question}

Provide a complete, detailed, and well-organized response:"""
    else:
        # Focused factual prompt — used for specific questions with top-k chunks
        prompt = f"""You are an AI meeting assistant.
Answer ONLY using the meeting transcript context below.
Be specific and direct. If the answer is not in the context, say: "I cannot find that information in the meeting transcript."

Meeting Transcript Context:
{context}

Question:
{question}

Answer:"""

    try:
        print(f"[FASTAPI] Sending {'summarization' if is_summary else 'specific'} query to Groq LLM...")
        response = llm.invoke(prompt)
        print("[FASTAPI] Groq LLM responded successfully.")
        return response.content
    except Exception as e:
        print(f"[FASTAPI] Groq LLM error: {e}")
        return "I apologize, but I encountered an error while connecting to the AI brain."
