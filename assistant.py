"""
AI response logic — Google Gemini with automatic API key rotation on rate limit.
"""

import os
import random
import time
from dotenv import load_dotenv

load_dotenv()

# Collect all available Gemini keys
_ALL_KEYS = [
    os.getenv('GEMINI_API_KEY'),
    os.getenv('GEMINI_API_KEY_2'),
    os.getenv('GEMINI_API_KEY_3'),
]
GEMINI_KEYS = [k for k in _ALL_KEYS if k and k != 'your_second_key_here' and k != 'your_third_key_here']
print(f'[Assistant] Found {len(GEMINI_KEYS)} Gemini API key(s)')

PERSONAS = {
    'tutor': (
        'You are a friendly, conversational tutor — like a smart friend who loves teaching. '
        'Talk naturally, use "you" and "I", be warm and encouraging. '
        'Format responses with markdown when helpful (bold key terms, bullet lists for steps). '
        'When explaining data or comparisons, output a JSON chart block like:\n'
        '```chart\n{"type":"bar","labels":["A","B"],"datasets":[{"label":"Example","data":[10,20]}]}\n```\n'
        'Always end with a natural follow-up question to keep the conversation going.'
    ),
    'customer_support': (
        'You are a warm, helpful support agent — conversational and empathetic. '
        'Use "I" and "you", acknowledge feelings, and give clear step-by-step help. '
        'Format steps as numbered lists. Keep it friendly, not robotic.'
    ),
    'productivity': (
        'You are an energetic productivity coach — conversational, motivating, and practical. '
        'Format tasks as checkboxes - [ ] and priorities in bold. '
        'When showing time data or progress, output a chart block if it helps.'
    ),
    'language_coach': (
        'You are a fun, encouraging language coach — conversational and patient. '
        'Use tables for word comparisons, bold for vocabulary, italics for pronunciation.'
    ),
}

FALLBACK = {
    'tutor':            ["That's a great question! I'm having trouble connecting — try again in a moment."],
    'customer_support': ["I'd love to help! Give me a moment and try again."],
    'productivity':     ["Let's get that sorted! Try sending that again."],
    'language_coach':   ["Good one! Lost connection for a sec — try again?"],
}

DEFAULT_PERSONA = os.getenv('ASSISTANT_MODE', 'tutor')


class VoiceAssistant:
    def __init__(self, mode: str = DEFAULT_PERSONA):
        self.mode = mode if mode in PERSONAS else 'tutor'
        self.history = []
        self.models = []          # one model per key
        self.current_key_idx = 0  # which key we're using now
        self._init_gemini()
        print(f'[Assistant] Mode: {self.mode}')

    def _init_gemini(self):
        if not GEMINI_KEYS:
            print('[Assistant] No GEMINI_API_KEY found — using offline fallback.')
            return
        try:
            import google.generativeai as genai
            self.models = []
            for key in GEMINI_KEYS:
                # Configure with this key, then build a model bound to it
                genai.configure(api_key=key)
                model = genai.GenerativeModel(
                    model_name='gemini-2.5-flash',
                    system_instruction=PERSONAS[self.mode],
                )
                self.models.append((key, model))
            # Leave genai configured with the first key as active
            genai.configure(api_key=GEMINI_KEYS[0])
            self.current_key_idx = 0
            print(f'[Assistant] {len(self.models)} Gemini model(s) ready (mode: {self.mode})')
        except Exception as e:
            print(f'[Assistant] Gemini init error: {e}')
            self.models = []

    def _get_model(self):
        if not self.models:
            return None
        return self.models[self.current_key_idx][1]

    def _rotate_key(self):
        """Switch to the next available API key and reconfigure genai."""
        if len(self.models) <= 1:
            return False
        next_idx = (self.current_key_idx + 1) % len(self.models)
        if next_idx == self.current_key_idx:
            return False
        self.current_key_idx = next_idx
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.models[self.current_key_idx][0])
        except Exception:
            pass
        print(f'[Assistant] Rotated to API key #{self.current_key_idx + 1}')
        return True

    def respond(self, user_input: str, image_data=None, pdf_text: str = None) -> str:
        if not user_input.strip() and not image_data and not pdf_text:
            return "I didn't catch that — could you say that again?"

        if not self.models:
            return random.choice(FALLBACK.get(self.mode, FALLBACK['tutor']))

        keys_tried = set()

        while len(keys_tried) < len(self.models):
            keys_tried.add(self.current_key_idx)
            model = self._get_model()

            try:
                parts = []
                if pdf_text:
                    combined = f"The user shared a PDF. Content:\n\n{pdf_text[:8000]}\n\nQuestion: {user_input}"
                    parts.append(combined)
                elif user_input:
                    parts.append(user_input)
                if image_data:
                    import PIL.Image, io
                    parts.append(PIL.Image.open(io.BytesIO(image_data)))

                chat = model.start_chat(history=self.history)
                response = chat.send_message(parts if len(parts) > 1 else parts[0])

                if not response.candidates:
                    return "I wasn't able to respond to that — could you rephrase it?"

                reply = response.text.strip()
                if not reply:
                    return "I got an empty response — please try again."

                print(f'[Gemini key#{self.current_key_idx+1}] Reply ({len(reply)} chars)')
                # Store what was actually sent so history context stays accurate
                history_user_text = parts[0] if isinstance(parts[0], str) else (user_input or '(attachment)')
                self.history.append({'role': 'user',  'parts': [history_user_text]})
                self.history.append({'role': 'model', 'parts': [reply]})
                return reply

            except Exception as e:
                err = str(e)
                print(f'[Gemini key#{self.current_key_idx+1} Error] {err[:120]}')

                is_rate_limit = '429' in err or 'quota' in err.lower() or 'rate' in err.lower() or 'RATE_LIMIT' in err

                if is_rate_limit:
                    print(f'[Assistant] Key #{self.current_key_idx+1} rate limited — trying next key...')
                    if not self._rotate_key():
                        # Only one key, wait and retry once
                        print('[Assistant] No more keys — waiting 15s...')
                        time.sleep(15)
                        try:
                            chat = model.start_chat(history=self.history)
                            response = chat.send_message(user_input)
                            reply = response.text.strip()
                            self.history.append({'role': 'user',  'parts': [user_input]})
                            self.history.append({'role': 'model', 'parts': [reply]})
                            return reply
                        except Exception:
                            return "I'm rate limited right now. Please wait 30 seconds and try again, or add more API keys to your .env file."
                    continue  # try next key
                else:
                    return f"I hit a snag — {err[:80]}. Try again?"

        return "All API keys are rate limited. Please wait a minute and try again."

    def reset(self):
        self.history = []
        print('[Assistant] Conversation reset.')
