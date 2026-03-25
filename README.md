# Murf Falcon Real-Time Voice Assistant

A voice-first conversational AI application powered by the **Murf Falcon TTS API**.
Speak to it, it thinks, it talks back — fully real-time.

## Features

- Real-time speech input via microphone (Google STT)
- Natural AI responses via OpenAI GPT-4o-mini (swappable)
- High-quality voice output via **Murf Falcon TTS API**
- 4 built-in personas: Tutor, Customer Support, Productivity, Language Coach
- Conversation memory within a session
- Voice commands: reset conversation, exit session

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

> On Windows, if `pyaudio` fails: `pip install pipwin && pipwin install pyaudio`

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your keys:

```
MURF_API_KEY=your_murf_api_key
OPENAI_API_KEY=your_openai_api_key
ASSISTANT_MODE=tutor
MURF_VOICE_ID=en-US-natalie
```

Get your Murf API key at: https://murf.ai/api  
Get your OpenAI API key at: https://platform.openai.com

### 3. Run

```bash
python main.py
```

Or specify a mode directly:

```bash
python main.py --mode language_coach
```

## Modes

| Mode | Description |
|------|-------------|
| `tutor` | Educational tutor for any subject |
| `customer_support` | Automated support agent |
| `productivity` | Task and schedule assistant |
| `language_coach` | Language learning companion |

## Voice Commands

| Say | Action |
|-----|--------|
| "quit" / "exit" / "bye" | End the session |
| "reset" / "start over" | Clear conversation history |

## Architecture

```
main.py          ← conversation loop + voice command handling
├── stt.py       ← microphone → text (SpeechRecognition)
├── assistant.py ← text → AI response (OpenAI)
└── tts.py       ← text → speech (Murf Falcon API)
```

## Swapping the LLM

`assistant.py` uses OpenAI but you can replace the `client.chat.completions.create(...)` call
with any LLM API (Anthropic, Gemini, local Ollama, etc.) — the interface is just `str → str`.
