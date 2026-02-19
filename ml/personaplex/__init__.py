"""
PersonaPlex — NVIDIA-Powered Voice AI Module for InSilico Lab
==============================================================

Integrates NVIDIA Riva (ASR + TTS) with Cerebras AI for
context-aware, real-time voice interaction.

Components:
  - session_manager: Voice session lifecycle
  - riva_client: NVIDIA Riva ASR/TTS integration
  - audio_processor: Audio buffer management & VAD
  - cerebras_bridge: LLM interaction via Cerebras API

Architecture:
  Browser (WebSocket) → Flask → PersonaPlex Session →
    Riva ASR → Cerebras LLM → Riva TTS → Browser
"""

__version__ = "1.0.0"
