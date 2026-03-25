# Murf Falcon Real-Time Voice Assistant

A voice-first conversational AI application powered by the **Murf Falcon TTS API**.
Speak to it, it thinks, it talks back — fully real-time.

🎥 Demo Video
link:  https://image2url.com/r2/default/videos/1774431852657-a50c344e-bffb-4ace-880d-0693528795c5.mp4

## 🧠 Overview

Resona is a real-time voice-first AI application built using the Murf Falcon Text-to-Speech API. The system is designed to enable natural, dynamic conversations where voice acts as the primary interface between the user and the application.

The application captures user input, processes it, and generates real-time voice responses using Murf’s high-quality text-to-speech technology. This creates a seamless and interactive conversational experience.

Resona demonstrates how voice can replace traditional UI interactions and be used effectively in modern applications such as virtual assistants, learning companions, and productivity tools.

The project focuses on:

* Real-time voice interaction
* Low-latency response generation
* Natural conversational flow
* Scalable voice-first design

This prototype highlights the potential of AI-powered voice interfaces in improving accessibility, engagement, and user experience.
## Features

- Real-time speech input via microphone (Google STT)
- Natural AI responses via OpenAI GPT-4o-mini (swappable)
- High-quality voice output via **Murf Falcon TTS API**
- 4 built-in personas: Tutor, Customer Support, Productivity, Language Coach
- Conversation memory within a session
- Voice commands: reset conversation, exit session

## Setup
## 🔌 API Usage (Murf Falcon Text-to-Speech)

This project uses the Murf Falcon Text-to-Speech API to convert dynamically generated text into realistic speech output.

### 🔹 How It Works

1. User provides input (text or speech)
2. The backend processes the input and generates a response
3. The response text is sent to the Murf API
4. Murf returns an audio file
5. The frontend plays the generated voice output in real time

---

### 🔹 API Integration

The application sends a POST request to the Murf API endpoint:

```
https://api.murf.ai/v1/speech/generate
```

### 🔹 Example Implementation

```js
const response = await fetch("https://api.murf.ai/v1/speech/generate", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.MURF_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    text: responseText,
    voiceId: "en-US-natalie"
  })
});

const data = await response.json();
```

---

### 🔹 Key Parameters

* `text`: The input text to be converted into speech
* `voiceId`: Specifies the voice model used for speech generation
* `Authorization`: Bearer token using Murf API key

---

### 🔹 Security Practices

* API keys are stored using environment variables (`.env`)
* Sensitive data is excluded via `.gitignore`
* `.env.example` is provided for safe setup

---

### 🔹 Output Handling

The API returns an audio file URL which is used by the frontend to play the generated speech dynamically, enabling real-time voice interaction.

---

This integration enables the application to deliver fast, natural, and high-quality voice responses, forming the core of the voice-first experience.
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
