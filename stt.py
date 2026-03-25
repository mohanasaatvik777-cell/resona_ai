"""
Speech-to-text using the microphone.
Uses Google's free STT via SpeechRecognition as default,
with a fallback to typed input if no mic is available.
"""

import speech_recognition as sr

recognizer = sr.Recognizer()
recognizer.energy_threshold = 300
recognizer.dynamic_energy_threshold = True
recognizer.pause_threshold = 0.8  # seconds of silence to end phrase


def listen(timeout: int = 10, phrase_limit: int = 15) -> str:
    """
    Listen from microphone and return transcribed text.
    Falls back to keyboard input on error.
    """
    print("\n[Listening...] Speak now.")
    try:
        with sr.Microphone() as source:
            recognizer.adjust_for_ambient_noise(source, duration=0.3)
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_limit)

        text = recognizer.recognize_google(audio)
        print(f"[You] {text}")
        return text

    except sr.WaitTimeoutError:
        print("[STT] No speech detected. Try again.")
        return ""
    except sr.UnknownValueError:
        print("[STT] Could not understand audio.")
        return ""
    except sr.RequestError as e:
        print(f"[STT Error] {e}")
        return ""
    except OSError:
        # No microphone available — fall back to text input
        return input("[You (text fallback)] ").strip()
