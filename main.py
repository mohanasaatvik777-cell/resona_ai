"""
Real-Time Voice Assistant — Murf Falcon TTS
Entry point for the voice-first conversation loop.

Usage:
    python main.py [--mode tutor|customer_support|productivity|language_coach]

Voice commands:
    "reset"  / "start over"  — clears conversation history
    "quit"   / "exit" / "bye" — ends the session
"""

import argparse
import sys
from assistant import VoiceAssistant
from stt import listen
from tts import speak


WAKE_PHRASES = {"reset", "start over", "clear history"}
EXIT_PHRASES = {"quit", "exit", "bye", "goodbye", "stop", "end session"}


def parse_args():
    parser = argparse.ArgumentParser(description="Murf Falcon Voice Assistant")
    parser.add_argument(
        "--mode",
        choices=["tutor", "customer_support", "productivity", "language_coach"],
        default=None,
        help="Assistant persona mode",
    )
    return parser.parse_args()


def greet(mode: str) -> str:
    greetings = {
        "tutor": "Hello! I'm your personal tutor. What would you like to learn today?",
        "customer_support": "Hi there! I'm here to help. What can I assist you with today?",
        "productivity": "Hey! Ready to get things done? Tell me what's on your agenda.",
        "language_coach": "Hello! I'm your language coach. Which language are we practicing today?",
    }
    return greetings.get(mode, "Hello! How can I help you today?")


def main():
    args = parse_args()

    print("=" * 50)
    print("  Murf Falcon Real-Time Voice Assistant")
    print("=" * 50)

    # Determine mode
    mode = args.mode
    if not mode:
        print("\nSelect assistant mode:")
        print("  1. tutor")
        print("  2. customer_support")
        print("  3. productivity")
        print("  4. language_coach")
        choice = input("Enter mode name or number [1-4] (default: tutor): ").strip()
        mode_map = {"1": "tutor", "2": "customer_support", "3": "productivity", "4": "language_coach"}
        mode = mode_map.get(choice, choice) if choice else "tutor"
        if mode not in ["tutor", "customer_support", "productivity", "language_coach"]:
            mode = "tutor"

    assistant = VoiceAssistant(mode=mode)

    # Greet the user
    greeting = greet(mode)
    print(f"\n[Assistant] {greeting}")
    speak(greeting)

    print("\nSay 'quit' or 'exit' to end. Say 'reset' to start over.\n")

    # Main conversation loop
    while True:
        user_input = listen()

        if not user_input:
            continue

        normalized = user_input.lower().strip()

        # Handle exit commands
        if any(phrase in normalized for phrase in EXIT_PHRASES):
            farewell = "Goodbye! It was great talking with you."
            print(f"[Assistant] {farewell}")
            speak(farewell)
            sys.exit(0)

        # Handle reset commands
        if any(phrase in normalized for phrase in WAKE_PHRASES):
            assistant.reset()
            msg = "Sure, let's start fresh. What would you like to talk about?"
            print(f"[Assistant] {msg}")
            speak(msg)
            continue

        # Generate and speak response
        response = assistant.respond(user_input)
        print(f"[Assistant] {response}")
        speak(response)


if __name__ == "__main__":
    main()
