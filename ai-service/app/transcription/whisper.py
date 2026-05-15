import os
import requests
from dotenv import load_dotenv

load_dotenv()

def transcribe_audio(filename: str, audio_bytes: bytes) -> str:
    """
    Transcribes audio using Groq's whisper model via REST API.
    This avoids SDK versioning issues with the 'audio' attribute.
    """
    try:
        print(f"[FASTAPI] Sending {filename} ({len(audio_bytes)} bytes) to Groq Whisper API...")
        
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not found in environment")

        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        files = {
            "file": (filename, audio_bytes, "audio/webm")
        }
        data = {
            "model": "whisper-large-v3",
            "response_format": "text"
        }

        response = requests.post(url, headers=headers, files=files, data=data, timeout=120)
        response.raise_for_status()
        
        # If response_format is "text", the response text is the transcription
        transcription = response.text
        
        print("[FASTAPI] Transcription successful.")
        return transcription
    except Exception as e:
        print(f"[FASTAPI] Transcription error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"[FASTAPI] API Response: {e.response.text}")
        raise e
