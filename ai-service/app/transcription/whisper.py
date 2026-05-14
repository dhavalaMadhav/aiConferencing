import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def transcribe_audio(filename: str, audio_bytes: bytes) -> str:
    """
    Transcribes audio using Groq's whisper model directly from memory.
    """
    try:
        print(f"[FASTAPI] Sending {filename} ({len(audio_bytes)} bytes) to Groq Whisper...")
        transcription = client.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model="whisper-large-v3",
            response_format="text",
        )
        print("[FASTAPI] Transcription successful.")
        return transcription
    except Exception as e:
        print(f"[FASTAPI] Transcription error: {e}")
        raise e
