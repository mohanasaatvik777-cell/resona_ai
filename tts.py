"""
Murf Falcon TTS integration.
Converts text to speech using the Murf API and plays it back.
"""

import os
import io
import requests
import pygame
import time
from dotenv import load_dotenv

load_dotenv()

MURF_API_KEY = os.getenv("MURF_API_KEY")
MURF_VOICE_ID = os.getenv("MURF_VOICE_ID", "en-US-natalie")

# Murf Falcon streaming TTS endpoint
MURF_TTS_URL = "https://api.murf.ai/v1/speech/generate"

# Initialize pygame mixer once
pygame.mixer.init(frequency=24000, size=-16, channels=1, buffer=512)


def speak(text: str) -> None:
    """Convert text to speech via Murf Falcon API and play it."""
    if not text.strip():
        return

    headers = {
        "api-key": MURF_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    payload = {
        "voiceId": MURF_VOICE_ID,
        "text": text,
        "audioFormat": "MP3",
        "sampleRate": 24000,
        "encodeAsBase64": False,
    }

    try:
        response = requests.post(MURF_TTS_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()

        data = response.json()
        audio_url = data.get("audioFile")

        if not audio_url:
            print("[TTS] No audio URL returned from Murf API.")
            return

        # Download the audio file
        audio_response = requests.get(audio_url, timeout=30)
        audio_response.raise_for_status()

        # Play audio using pygame
        audio_bytes = io.BytesIO(audio_response.content)
        pygame.mixer.music.load(audio_bytes)
        pygame.mixer.music.play()

        # Wait for playback to finish
        while pygame.mixer.music.get_busy():
            time.sleep(0.05)

    except requests.exceptions.RequestException as e:
        print(f"[TTS Error] {e}")
    except Exception as e:
        print(f"[TTS Playback Error] {e}")
