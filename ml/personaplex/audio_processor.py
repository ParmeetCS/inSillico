"""
audio_processor.py — Audio Buffer Management & Voice Activity Detection
=========================================================================

Handles:
  - Audio chunk buffering for streaming ASR
  - Voice Activity Detection (VAD) for turn management
  - Audio format conversion (WebSocket binary → PCM)
  - Silence detection for end-of-speech
  - Audio level metering for waveform visualization
"""

import struct
import math
import logging
from collections import deque
from typing import Optional

logger = logging.getLogger("personaplex.audio")

# ─── Configuration ───

SAMPLE_RATE = 16000          # 16kHz for ASR
CHANNELS = 1                 # Mono
SAMPLE_WIDTH = 2             # 16-bit
FRAME_SIZE_MS = 30           # 30ms frames for VAD
FRAME_SIZE = int(SAMPLE_RATE * FRAME_SIZE_MS / 1000) * SAMPLE_WIDTH

# VAD thresholds
SILENCE_THRESHOLD_DB = -35   # dBFS below which is "silence"
SPEECH_THRESHOLD_DB = -25    # dBFS above which is "speech"
SILENCE_DURATION_MS = 1500   # 1.5s of silence = end of speech
MIN_SPEECH_DURATION_MS = 300 # Minimum speech before accepting

# Buffer limits
MAX_BUFFER_SEC = 30          # Maximum recording length
MAX_BUFFER_BYTES = SAMPLE_RATE * SAMPLE_WIDTH * MAX_BUFFER_SEC


class AudioProcessor:
    """
    Processes incoming audio for the voice pipeline.

    Features:
      - Accumulates audio chunks from WebSocket
      - Detects voice activity (speech start/end)
      - Computes audio levels for visualization
      - Manages audio buffer lifecycle
    """

    def __init__(self):
        self._buffer = bytearray()
        self._frame_buffer = bytearray()
        self._is_speech_active = False
        self._speech_start_ms = 0
        self._silence_start_ms = 0
        self._total_ms = 0
        self._levels: deque = deque(maxlen=100)  # Recent audio levels

    def reset(self):
        """Reset all buffers and state."""
        self._buffer.clear()
        self._frame_buffer.clear()
        self._is_speech_active = False
        self._speech_start_ms = 0
        self._silence_start_ms = 0
        self._total_ms = 0
        self._levels.clear()

    def add_chunk(self, audio_data: bytes) -> dict:
        """
        Process an incoming audio chunk.

        Args:
            audio_data: Raw PCM audio bytes (16-bit mono, 16kHz)

        Returns:
            {
                "level_db": float,        # Current audio level in dBFS
                "level_normalized": float, # 0.0-1.0 normalized level
                "is_speech": bool,         # Voice activity detected
                "speech_ended": bool,      # End-of-speech detected
                "buffer_duration_ms": int, # Total buffered duration
                "buffer_full": bool,       # Buffer at max capacity
            }
        """
        # Append to main buffer
        if len(self._buffer) < MAX_BUFFER_BYTES:
            self._buffer.extend(audio_data)
        else:
            return {
                "level_db": -100,
                "level_normalized": 0,
                "is_speech": False,
                "speech_ended": True,
                "buffer_duration_ms": self._total_ms,
                "buffer_full": True,
            }

        # Update timing
        chunk_ms = len(audio_data) / (SAMPLE_RATE * SAMPLE_WIDTH) * 1000
        self._total_ms += chunk_ms

        # Compute audio level
        level_db = self._compute_level_db(audio_data)
        level_norm = self._db_to_normalized(level_db)
        self._levels.append(level_norm)

        # VAD logic
        speech_ended = False

        if level_db > SPEECH_THRESHOLD_DB:
            # Speech detected
            if not self._is_speech_active:
                self._is_speech_active = True
                self._speech_start_ms = self._total_ms
                logger.debug(f"Speech started at {self._total_ms:.0f}ms")
            self._silence_start_ms = 0
        elif level_db < SILENCE_THRESHOLD_DB:
            # Silence detected
            if self._is_speech_active:
                if self._silence_start_ms == 0:
                    self._silence_start_ms = self._total_ms
                elif (self._total_ms - self._silence_start_ms) >= SILENCE_DURATION_MS:
                    # Enough silence after speech → end of turn
                    speech_duration = self._total_ms - self._speech_start_ms
                    if speech_duration >= MIN_SPEECH_DURATION_MS:
                        speech_ended = True
                        logger.debug(
                            f"Speech ended at {self._total_ms:.0f}ms "
                            f"(duration: {speech_duration:.0f}ms)"
                        )

        return {
            "level_db": round(level_db, 1),
            "level_normalized": round(level_norm, 3),
            "is_speech": self._is_speech_active and not speech_ended,
            "speech_ended": speech_ended,
            "buffer_duration_ms": int(self._total_ms),
            "buffer_full": False,
        }

    def get_audio_buffer(self) -> bytes:
        """Get the accumulated audio buffer."""
        return bytes(self._buffer)

    def get_recent_levels(self) -> list:
        """Get recent audio levels for waveform visualization."""
        return list(self._levels)

    @property
    def buffer_duration_ms(self) -> int:
        return int(self._total_ms)

    @property
    def has_speech(self) -> bool:
        return self._is_speech_active

    @staticmethod
    def _compute_level_db(audio_data: bytes) -> float:
        """Compute RMS level in dBFS for an audio chunk."""
        if len(audio_data) < 2:
            return -100.0

        n_samples = len(audio_data) // 2
        if n_samples == 0:
            return -100.0

        try:
            samples = struct.unpack(f"<{n_samples}h", audio_data[:n_samples * 2])
            rms = math.sqrt(sum(s * s for s in samples) / n_samples)
            if rms < 1:
                return -100.0
            db = 20 * math.log10(rms / 32768.0)
            return max(-100.0, db)
        except Exception:
            return -100.0

    @staticmethod
    def _db_to_normalized(db: float) -> float:
        """Convert dBFS to 0.0-1.0 range."""
        # Map -60dB..0dB → 0.0..1.0
        normalized = (db + 60) / 60
        return max(0.0, min(1.0, normalized))


class AudioConverter:
    """
    Utility for audio format conversions.
    """

    @staticmethod
    def float32_to_int16(float_data: bytes) -> bytes:
        """Convert float32 PCM to int16 PCM."""
        n_samples = len(float_data) // 4
        float_samples = struct.unpack(f"<{n_samples}f", float_data)
        int_samples = [
            max(-32768, min(32767, int(s * 32767)))
            for s in float_samples
        ]
        return struct.pack(f"<{n_samples}h", *int_samples)

    @staticmethod
    def resample_simple(audio: bytes, from_rate: int, to_rate: int) -> bytes:
        """Simple linear resampling (nearest-neighbor)."""
        if from_rate == to_rate:
            return audio

        n_samples = len(audio) // 2
        samples = struct.unpack(f"<{n_samples}h", audio)

        ratio = to_rate / from_rate
        new_n = int(n_samples * ratio)
        new_samples = []

        for i in range(new_n):
            src_idx = min(int(i / ratio), n_samples - 1)
            new_samples.append(samples[src_idx])

        return struct.pack(f"<{new_n}h", *new_samples)
