"""
Flask server — text, image, PDF, voice, chart support.
"""

import os
import re
import uuid
import time
import tempfile
import threading
import requests
from flask import Flask, request, jsonify, send_from_directory, Response
from dotenv import load_dotenv
from assistant import VoiceAssistant
import history_store

load_dotenv()

app = Flask(__name__, static_folder='static')

MURF_API_KEY = os.getenv('MURF_API_KEY')
MURF_TTS_URL = 'https://api.murf.ai/v1/speech/generate'

assistant = VoiceAssistant(mode=os.getenv('ASSISTANT_MODE', 'tutor'))

# TTS cache with TTL to prevent unbounded memory growth
_tts_cache = {}
_tts_cache_lock = threading.Lock()
_TTS_CACHE_TTL = 120  # seconds

def _tts_cache_set(token: str, url: str):
    with _tts_cache_lock:
        _tts_cache[token] = {'url': url, 'ts': time.time()}
    # Evict expired entries
    _tts_cache_evict()

def _tts_cache_pop(token: str):
    with _tts_cache_lock:
        entry = _tts_cache.pop(token, None)
    return entry['url'] if entry else None

def _tts_cache_evict():
    now = time.time()
    with _tts_cache_lock:
        expired = [k for k, v in _tts_cache.items() if now - v['ts'] > _TTS_CACHE_TTL]
        for k in expired:
            del _tts_cache[k]


# ── Static ────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)


# ── Chat (text) ───────────────────────────
@app.route('/api/chat', methods=['POST'])
def chat():
    data    = request.get_json(force=True)
    message = data.get('message', '').strip()
    voice   = data.get('voice', os.getenv('MURF_VOICE_ID', 'en-US-natalie'))

    if not message:
        return jsonify({'error': 'Empty message'}), 400

    print(f'[Chat] User: {message}')

    # Detect image/photo requests and fetch from Wikipedia
    fetched_images = []
    image_subject = detect_image_request(message)
    if image_subject:
        fetched_images = fetch_wikipedia_images(image_subject)
        print(f'[Images] Found {len(fetched_images)} images for "{image_subject}"')

    reply = assistant.respond(message)
    print(f'[Chat] Gemini: {reply[:80]}...')

    # Save both turns to persistent history
    history_store.add_entry('user', message, mode=assistant.mode)
    history_store.add_entry('assistant', reply, mode=assistant.mode)

    chart_data  = extract_chart(reply)
    clean_reply = strip_chart_block(reply) if chart_data else reply
    audio_url   = generate_tts(clean_reply, voice)

    return jsonify({
        'text': clean_reply,
        'audio_url': audio_url,
        'chart': chart_data,
        'images': fetched_images,
    })


# ── Chat with image ───────────────────────
@app.route('/api/chat/image', methods=['POST'])
def chat_image():
    message    = request.form.get('message', 'Describe this image in detail.')
    voice      = request.form.get('voice', os.getenv('MURF_VOICE_ID', 'en-US-natalie'))
    image_file = request.files.get('image')

    if not image_file:
        return jsonify({'error': 'No image provided'}), 400

    image_data = image_file.read()
    print(f'[Chat/Image] {image_file.filename} ({len(image_data)} bytes)')

    reply = assistant.respond(message, image_data=image_data)
    chart_data = extract_chart(reply)
    clean_reply = strip_chart_block(reply) if chart_data else reply

    history_store.add_entry('user', f'[Image: {image_file.filename}] {message}', mode=assistant.mode)
    history_store.add_entry('assistant', clean_reply, mode=assistant.mode)

    audio_url = generate_tts(clean_reply, voice)
    return jsonify({'text': clean_reply, 'audio_url': audio_url, 'chart': chart_data})


# ── Chat with PDF ─────────────────────────
@app.route('/api/chat/pdf', methods=['POST'])
def chat_pdf():
    message  = request.form.get('message', 'Summarize this document.')
    voice    = request.form.get('voice', os.getenv('MURF_VOICE_ID', 'en-US-natalie'))
    pdf_file = request.files.get('pdf')

    if not pdf_file:
        return jsonify({'error': 'No PDF provided'}), 400

    pdf_text = extract_pdf_text(pdf_file)
    print(f'[Chat/PDF] Extracted {len(pdf_text)} chars')

    reply = assistant.respond(message, pdf_text=pdf_text)
    chart_data = extract_chart(reply)
    clean_reply = strip_chart_block(reply) if chart_data else reply

    history_store.add_entry('user', f'[PDF] {message}', mode=assistant.mode)
    history_store.add_entry('assistant', clean_reply, mode=assistant.mode)

    audio_url = generate_tts(clean_reply, voice)
    return jsonify({'text': clean_reply, 'audio_url': audio_url, 'chart': chart_data})


# ── TTS only ──────────────────────────────
@app.route('/api/tts', methods=['POST'])
def tts():
    data  = request.get_json(force=True)
    text  = data.get('text', '').strip()
    voice = data.get('voice', os.getenv('MURF_VOICE_ID', 'en-US-natalie'))
    if not text:
        return jsonify({'error': 'Empty text'}), 400
    return jsonify({'audio_url': generate_tts(text, voice)})


# ── Transcribe voice ──────────────────────
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio'}), 400

    audio_file = request.files['audio']
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name

    wav_path  = tmp_path.replace('.webm', '.wav')
    converted = False
    try:
        import subprocess
        r = subprocess.run(
            ['ffmpeg', '-y', '-i', tmp_path, '-ar', '16000', '-ac', '1', wav_path],
            capture_output=True, timeout=15
        )
        converted = r.returncode == 0
    except Exception:
        pass

    try:
        import speech_recognition as sr
        rec = sr.Recognizer()
        with sr.AudioFile(wav_path if converted else tmp_path) as src:
            audio = rec.record(src)
        text = rec.recognize_google(audio)
        return jsonify({'text': text})
    except Exception as e:
        print(f'[STT] {e}')
        return jsonify({'text': '', 'hint': 'Could not transcribe — try typing instead'})
    finally:
        for p in [tmp_path, wav_path]:
            try: os.unlink(p)
            except: pass


# ── Mode switch ───────────────────────────
@app.route('/api/mode', methods=['POST'])
def set_mode():
    data = request.get_json(force=True)
    mode = data.get('mode', 'tutor')
    if mode not in ['tutor', 'customer_support', 'productivity', 'language_coach']:
        return jsonify({'error': 'Invalid mode'}), 400
    assistant.mode = mode
    assistant.history = []
    assistant._init_gemini()
    return jsonify({'mode': mode})


# ── Reset ─────────────────────────────────
@app.route('/api/reset', methods=['POST'])
def reset():
    assistant.reset()
    return jsonify({'status': 'ok'})


# ── History endpoints ─────────────────────
@app.route('/api/history', methods=['GET'])
def get_history():
    limit = request.args.get('limit', 100, type=int)
    return jsonify(history_store.get_recent(limit))

@app.route('/api/history/clear', methods=['POST'])
def clear_history_api():
    history_store.clear()
    assistant.reset()
    return jsonify({'status': 'ok'})


# ── Helpers ───────────────────────────────
def detect_image_request(message: str):
    """
    Returns a search subject if the user is asking for an image/photo of something.
    e.g. "show me srinivasa ramanujan" → "srinivasa ramanujan"
    """
    patterns = [
        r'(?:show|display|get|fetch|find|give)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|picture|pic)\s+(?:of\s+)?(.+)',
        r'(?:image|photo|picture|pic)\s+(?:of\s+)(.+)',
        r'who\s+(?:is|was)\s+(.+)',
        r'what\s+does\s+(.+?)\s+look\s+like',
    ]
    msg = message.lower().strip().rstrip('?.')
    for pattern in patterns:
        m = re.search(pattern, msg)
        if m:
            subject = m.group(1).strip()
            # Remove trailing filler words
            subject = re.sub(r'\s*(please|thanks|thank you)$', '', subject).strip()
            return subject if len(subject) > 2 else None
    return None


def fetch_wikipedia_images(subject: str) -> list:
    """
    Fetch up to 3 relevant images from Wikipedia for a given subject.
    Uses the free Wikipedia API — no key needed.
    """
    try:
        # Search for the page
        search_url = 'https://en.wikipedia.org/w/api.php'
        search_res = requests.get(search_url, params={
            'action': 'query', 'list': 'search',
            'srsearch': subject, 'srlimit': 1, 'format': 'json',
        }, timeout=8)
        search_data = search_res.json()
        results = search_data.get('query', {}).get('search', [])
        if not results:
            return []

        page_title = results[0]['title']

        # Get images from that page
        img_res = requests.get(search_url, params={
            'action': 'query', 'titles': page_title,
            'prop': 'pageimages', 'pithumbsize': 400,
            'format': 'json',
        }, timeout=8)
        img_data = img_res.json()
        pages = img_data.get('query', {}).get('pages', {})

        images = []
        for page in pages.values():
            thumb = page.get('thumbnail', {})
            if thumb.get('source'):
                images.append({
                    'url': thumb['source'],
                    'caption': page_title,
                })

        # Also try to get more images from the page
        extra_res = requests.get(search_url, params={
            'action': 'query', 'titles': page_title,
            'prop': 'images', 'imlimit': 5, 'format': 'json',
        }, timeout=8)
        extra_data = extra_res.json()
        extra_pages = extra_data.get('query', {}).get('pages', {})
        for page in extra_pages.values():
            for img in page.get('images', [])[:3]:
                name = img.get('title', '')
                if any(ext in name.lower() for ext in ['.jpg', '.jpeg', '.png']):
                    # Get direct URL for this image
                    file_res = requests.get(search_url, params={
                        'action': 'query', 'titles': name,
                        'prop': 'imageinfo', 'iiprop': 'url',
                        'iiurlwidth': 400, 'format': 'json',
                    }, timeout=8)
                    file_pages = file_res.json().get('query', {}).get('pages', {})
                    for fp in file_pages.values():
                        info = fp.get('imageinfo', [{}])[0]
                        url = info.get('thumburl') or info.get('url')
                        if url and url not in [i['url'] for i in images]:
                            images.append({'url': url, 'caption': name.replace('File:', '')})
                            if len(images) >= 3:
                                break
                if len(images) >= 3:
                    break

        return images[:3]

    except Exception as e:
        print(f'[Wikipedia] Error: {e}')
        return []


def extract_pdf_text(pdf_file) -> str:
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(pdf_file)
        return '\n'.join(p.extract_text() or '' for p in reader.pages)
    except Exception as e:
        print(f'[PDF] PyPDF2 error: {e}')
        try:
            import pdfplumber
            with pdfplumber.open(pdf_file) as pdf:
                return '\n'.join(p.extract_text() or '' for p in pdf.pages)
        except Exception as e2:
            print(f'[PDF] pdfplumber error: {e2}')
            return 'Could not extract PDF text.'


def extract_chart(text: str):
    """Pull JSON chart data from ```chart ... ``` blocks."""
    import re, json
    match = re.search(r'```chart\s*([\s\S]*?)```', text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception:
            pass
    return None


def strip_chart_block(text: str) -> str:
    import re
    return re.sub(r'```chart[\s\S]*?```', '', text).strip()


def generate_tts(text: str, voice_id: str):
    if not MURF_API_KEY or not text:
        return None
    try:
        # Strip markdown so Murf reads clean text
        clean = strip_markdown(text)
        # Murf has a ~3000 char limit
        clean = clean[:3000].strip()
        if not clean:
            return None

        res = requests.post(MURF_TTS_URL, json={
            'voiceId': voice_id, 'text': clean,
            'audioFormat': 'MP3', 'sampleRate': 24000, 'encodeAsBase64': False,
        }, headers={'api-key': MURF_API_KEY, 'Content-Type': 'application/json'}, timeout=30)

        print(f'[TTS] Murf status: {res.status_code}')
        if not res.ok:
            print(f'[TTS] Error: {res.text}')
            return None

        data = res.json()
        print(f'[TTS] Murf response keys: {list(data.keys())}')
        audio_url = data.get('audioFile') or data.get('audio_file') or data.get('url')
        if not audio_url:
            print(f'[TTS] No audio URL in response: {data}')
            return None

        token = str(uuid.uuid4())
        _tts_cache_set(token, audio_url)
        return f'/api/tts/proxy/{token}'
    except Exception as e:
        print(f'[TTS Error] {e}')
        return None


def strip_markdown(text: str) -> str:
    """Remove markdown formatting so Murf TTS reads clean natural text."""
    import re
    # Remove code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`]*`', '', text)
    # Remove headers
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove bold/italic
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', text)
    # Remove links
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove bullet points
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    # Remove blockquotes
    text = re.sub(r'^\s*>\s+', '', text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r'^[-*_]{3,}$', '', text, flags=re.MULTILINE)
    # Clean up extra whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


@app.route('/api/tts/proxy/<token>')
def tts_proxy(token):
    url = _tts_cache_pop(token)
    if not url:
        return 'Not found', 404
    r = requests.get(url, timeout=30, stream=True)
    return Response(r.iter_content(4096), content_type=r.headers.get('Content-Type', 'audio/mpeg'))


if __name__ == '__main__':
    print('Starting Murf Voice Assistant...')
    print('Open http://localhost:5000')
    app.run(debug=True, port=5000)
