"""
riva_client.py — NVIDIA Riva ASR/TTS Client
=============================================

Interfaces with NVIDIA Riva for:
  - Streaming Speech-to-Text (ASR)
  - Text-to-Speech (TTS)

Supports two modes:
  1. NVIDIA Cloud (NVCF) — grpc.nvcf.nvidia.com:443 with nvapi- keys
  2. Self-hosted Riva — local gRPC server (e.g., localhost:50051)

When Riva is not available, falls back to returning audio for
browser-side Web Speech API processing.

Configuration via environment variables:
  RIVA_API_URL    — Riva server endpoint (e.g., grpc.nvcf.nvidia.com:443)
  RIVA_API_KEY    — API key (nvapi-... for cloud)
  RIVA_USE_SSL    — Use SSL for gRPC connection (auto-detected for cloud)
  RIVA_TTS_VOICE  — Voice name for TTS
"""

import os
import io
import json
import wave
import struct
import logging
import base64
from typing import Optional, Generator, AsyncGenerator

logger = logging.getLogger("personaplex.riva")

# ─── Configuration ───

RIVA_API_URL = os.environ.get("RIVA_API_URL", "").strip()
RIVA_API_KEY = os.environ.get("RIVA_API_KEY", "").strip()
_ssl_env = os.environ.get("RIVA_USE_SSL", "").strip().lower()
# Auto-detect SSL for cloud endpoints
RIVA_USE_SSL = (
    _ssl_env == "true"
    or "nvcf.nvidia.com" in RIVA_API_URL
    or ":443" in RIVA_API_URL
)

# TTS voice configuration
TTS_VOICE = os.environ.get("RIVA_TTS_VOICE", "English-US.Female-1").strip()
TTS_SAMPLE_RATE = 22050
TTS_ENCODING = "pcm"  # LINEAR16

# ASR configuration
ASR_LANGUAGE = "en-US"
ASR_SAMPLE_RATE = 16000
ASR_ENCODING = "LINEAR16"

# NVIDIA Cloud Function IDs for Riva services
NVCF_TTS_FUNCTION_ID = "0149dedb-2be8-4195-b9a0-e57e0e14f972"
NVCF_ASR_FUNCTION_ID = "1598d209-5e27-4d3c-8079-4751568b1081"


class RivaASRClient:
    """
    NVIDIA Riva Automatic Speech Recognition client.

    Converts audio streams to text transcripts.
    Falls back to returning raw audio for browser-side processing
    when Riva is not available.
    """

    def __init__(self):
        self._riva_available = bool(RIVA_API_URL)
        self._grpc_stub = None
        self._asr_service = None

        if self._riva_available:
            self._init_grpc()

    def _init_grpc(self):
        """Initialize gRPC connection to Riva ASR server."""
        try:
            import grpc
            import riva.client as riva_client

            # Build metadata for authentication
            metadata = []
            if RIVA_API_KEY:
                metadata.append(("authorization", f"Bearer {RIVA_API_KEY}"))
            # NVCF cloud requires function-id metadata
            if "nvcf.nvidia.com" in RIVA_API_URL:
                metadata.append(("function-id", NVCF_ASR_FUNCTION_ID))

            auth = riva_client.Auth(
                ssl_root_cert=None,
                use_ssl=RIVA_USE_SSL,
                uri=RIVA_API_URL,
                metadata_args=metadata if metadata else None,
            )
            self._asr_service = riva_client.ASRService(auth)
            logger.info(f"Riva ASR connected: {RIVA_API_URL} (SSL={RIVA_USE_SSL})")
        except ImportError:
            logger.warning("nvidia-riva-client not installed. ASR will use browser fallback.")
            self._riva_available = False
        except Exception as e:
            logger.warning(f"Riva ASR connection failed: {e}. Using browser fallback.")
            self._riva_available = False

    @property
    def is_available(self) -> bool:
        return self._riva_available

    def transcribe_streaming(self, audio_chunks: Generator[bytes, None, None]) -> Generator[dict, None, None]:
        """
        Stream audio chunks to Riva ASR and yield transcript events.

        Yields: {"text": str, "is_final": bool, "confidence": float}
        """
        if not self._riva_available:
            yield {"text": "", "is_final": False, "confidence": 0, "fallback": True}
            return

        try:
            import riva.client as riva_client

            config = riva_client.StreamingRecognitionConfig(
                config=riva_client.RecognitionConfig(
                    encoding=riva_client.AudioEncoding.LINEAR_PCM,
                    sample_rate_hertz=ASR_SAMPLE_RATE,
                    language_code=ASR_LANGUAGE,
                    max_alternatives=1,
                    enable_automatic_punctuation=True,
                ),
                interim_results=True,
            )

            responses = self._asr_service.streaming_response_generator(
                audio_chunks=audio_chunks,
                streaming_config=config,
            )

            for response in responses:
                for result in response.results:
                    if result.alternatives:
                        alt = result.alternatives[0]
                        yield {
                            "text": alt.transcript,
                            "is_final": result.is_final,
                            "confidence": alt.confidence,
                        }
        except Exception as e:
            logger.error(f"Riva ASR streaming error: {e}")
            yield {"text": "", "is_final": True, "confidence": 0, "error": str(e)}

    def transcribe_audio(self, audio_data: bytes) -> dict:
        """
        Transcribe a complete audio buffer.

        Returns: {"text": str, "confidence": float}
        """
        if not self._riva_available:
            return {"text": "", "confidence": 0, "fallback": True}

        try:
            import riva.client as riva_client

            config = riva_client.RecognitionConfig(
                encoding=riva_client.AudioEncoding.LINEAR_PCM,
                sample_rate_hertz=ASR_SAMPLE_RATE,
                language_code=ASR_LANGUAGE,
                max_alternatives=1,
                enable_automatic_punctuation=True,
            )

            response = self._asr_service.offline_recognize(
                audio_data, config
            )

            if response.results and response.results[0].alternatives:
                alt = response.results[0].alternatives[0]
                return {"text": alt.transcript, "confidence": alt.confidence}

            return {"text": "", "confidence": 0}
        except Exception as e:
            logger.error(f"Riva ASR error: {e}")
            return {"text": "", "confidence": 0, "error": str(e)}


class RivaTTSClient:
    """
    NVIDIA Riva Text-to-Speech client.

    Converts text responses to audio for streaming playback.
    Falls back to returning text for browser-side Web Speech API
    when Riva is not available.
    """

    def __init__(self):
        self._riva_available = bool(RIVA_API_URL)
        self._tts_service = None

        if self._riva_available:
            self._init_grpc()

    def _init_grpc(self):
        """Initialize gRPC connection to Riva TTS server."""
        try:
            import grpc
            import riva.client as riva_client

            # Build metadata for authentication
            metadata = []
            if RIVA_API_KEY:
                metadata.append(("authorization", f"Bearer {RIVA_API_KEY}"))
            # NVCF cloud requires function-id metadata
            if "nvcf.nvidia.com" in RIVA_API_URL:
                metadata.append(("function-id", NVCF_TTS_FUNCTION_ID))

            auth = riva_client.Auth(
                ssl_root_cert=None,
                use_ssl=RIVA_USE_SSL,
                uri=RIVA_API_URL,
                metadata_args=metadata if metadata else None,
            )
            self._tts_service = riva_client.SpeechSynthesisService(auth)
            logger.info(f"Riva TTS connected: {RIVA_API_URL} (SSL={RIVA_USE_SSL})")
        except ImportError:
            logger.warning("nvidia-riva-client not installed. TTS will use browser fallback.")
            self._riva_available = False
        except Exception as e:
            logger.warning(f"Riva TTS connection failed: {e}. Using browser fallback.")
            self._riva_available = False

    @property
    def is_available(self) -> bool:
        return self._riva_available

    def synthesize(self, text: str) -> Optional[bytes]:
        """
        Synthesize text to audio.

        Returns: WAV audio bytes, or None if Riva unavailable.
        """
        if not self._riva_available:
            return None

        try:
            import riva.client as riva_client

            response = self._tts_service.synthesize(
                text=text,
                voice_name=TTS_VOICE,
                language_code="en-US",
                encoding=riva_client.AudioEncoding.LINEAR_PCM,
                sample_rate_hz=TTS_SAMPLE_RATE,
            )

            return self._pcm_to_wav(response.audio, TTS_SAMPLE_RATE)
        except Exception as e:
            logger.error(f"Riva TTS error: {e}")
            return None

    def synthesize_streaming(self, text: str) -> Generator[bytes, None, None]:
        """
        Stream synthesized audio in chunks.

        Yields: PCM audio chunks for real-time playback.
        """
        if not self._riva_available:
            return

        try:
            import riva.client as riva_client

            responses = self._tts_service.synthesize_online(
                text=text,
                voice_name=TTS_VOICE,
                language_code="en-US",
                encoding=riva_client.AudioEncoding.LINEAR_PCM,
                sample_rate_hz=TTS_SAMPLE_RATE,
            )

            for response in responses:
                if response.audio:
                    yield response.audio
        except Exception as e:
            logger.error(f"Riva TTS streaming error: {e}")

    @staticmethod
    def _pcm_to_wav(pcm_data: bytes, sample_rate: int, channels: int = 1, sample_width: int = 2) -> bytes:
        """Convert raw PCM audio to WAV format."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_data)
        return buf.getvalue()

    def synthesize_to_base64(self, text: str) -> Optional[str]:
        """
        Synthesize text and return base64-encoded WAV audio.
        Useful for JSON API responses.
        """
        audio = self.synthesize(text)
        if audio:
            return base64.b64encode(audio).decode("utf-8")
        return None


# ─── Singletons ───

_asr_client: Optional[RivaASRClient] = None
_tts_client: Optional[RivaTTSClient] = None


def get_asr_client() -> RivaASRClient:
    global _asr_client
    if _asr_client is None:
        _asr_client = RivaASRClient()
    return _asr_client


def get_tts_client() -> RivaTTSClient:
    global _tts_client
    if _tts_client is None:
        _tts_client = RivaTTSClient()
    return _tts_client
