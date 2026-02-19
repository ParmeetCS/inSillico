"""
session_manager.py — Voice Session Lifecycle Manager
=====================================================

Manages per-user voice sessions with:
  - Session creation, tracking, and cleanup
  - Conversation history with token-aware truncation
  - Context injection from user data
  - Rate limiting per user
  - Graceful timeout handling

Thread-safe: uses locks for session dict access.
"""

import uuid
import time
import threading
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("personaplex.session")

# ─── Configuration ───

MAX_SESSIONS = 100               # Global session limit
SESSION_TIMEOUT_SEC = 600        # 10 min idle timeout
MAX_HISTORY_MESSAGES = 20        # Conversation window
MAX_SESSIONS_PER_USER = 3        # Per-user rate limit
CLEANUP_INTERVAL_SEC = 60        # Cleanup sweep interval


@dataclass
class ConversationMessage:
    role: str           # "user" | "assistant" | "system"
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class VoiceSession:
    """Represents an active voice interaction session."""
    session_id: str
    user_id: str
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    history: list = field(default_factory=list)
    context: dict = field(default_factory=dict)
    is_active: bool = True
    is_speaking: bool = False
    is_listening: bool = False
    turn_count: int = 0

    def add_message(self, role: str, content: str):
        """Add a message to conversation history."""
        self.history.append(ConversationMessage(role=role, content=content))
        self.last_activity = time.time()
        if role == "user":
            self.turn_count += 1

        # Truncate history if too long (keep system + recent messages)
        if len(self.history) > MAX_HISTORY_MESSAGES:
            # Keep first message (system context) and recent ones
            system_msgs = [m for m in self.history if m.role == "system"]
            recent = self.history[-(MAX_HISTORY_MESSAGES - len(system_msgs)):]
            self.history = system_msgs + recent

    def get_messages_for_llm(self) -> list:
        """Get conversation history formatted for LLM API."""
        return [
            {"role": m.role, "content": m.content}
            for m in self.history
        ]

    def is_expired(self) -> bool:
        """Check if session has timed out."""
        return (time.time() - self.last_activity) > SESSION_TIMEOUT_SEC

    def touch(self):
        """Update last activity timestamp."""
        self.last_activity = time.time()


class SessionManager:
    """
    Thread-safe voice session manager.

    Handles creation, retrieval, cleanup of voice sessions
    with per-user rate limiting.
    """

    def __init__(self):
        self._sessions: dict[str, VoiceSession] = {}
        self._user_sessions: dict[str, list[str]] = {}  # user_id → [session_ids]
        self._lock = threading.Lock()
        self._cleanup_thread: Optional[threading.Thread] = None
        self._running = False

    def start(self):
        """Start the background cleanup thread."""
        self._running = True
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="session-cleanup",
        )
        self._cleanup_thread.start()
        logger.info("Session manager started")

    def stop(self):
        """Stop the cleanup thread."""
        self._running = False
        if self._cleanup_thread:
            self._cleanup_thread.join(timeout=5)
        logger.info("Session manager stopped")

    def create_session(
        self,
        user_id: str,
        context: Optional[dict] = None,
    ) -> VoiceSession:
        """
        Create a new voice session for a user.

        Raises:
            ValueError: If user has too many active sessions
            RuntimeError: If global session limit reached
        """
        with self._lock:
            # Check global limit
            if len(self._sessions) >= MAX_SESSIONS:
                self._force_cleanup()
                if len(self._sessions) >= MAX_SESSIONS:
                    raise RuntimeError("Server at voice session capacity. Try again later.")

            # Check per-user limit
            user_session_ids = self._user_sessions.get(user_id, [])
            active_count = sum(
                1 for sid in user_session_ids
                if sid in self._sessions and self._sessions[sid].is_active
            )
            if active_count >= MAX_SESSIONS_PER_USER:
                raise ValueError(f"Maximum {MAX_SESSIONS_PER_USER} concurrent voice sessions per user.")

            # Create session
            session_id = str(uuid.uuid4())
            session = VoiceSession(
                session_id=session_id,
                user_id=user_id,
                context=context or {},
            )

            self._sessions[session_id] = session

            if user_id not in self._user_sessions:
                self._user_sessions[user_id] = []
            self._user_sessions[user_id].append(session_id)

            logger.info(f"Session created: {session_id[:8]}... for user {user_id[:8]}...")
            return session

    def get_session(self, session_id: str) -> Optional[VoiceSession]:
        """Retrieve an active session by ID."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session and session.is_active and not session.is_expired():
                session.touch()
                return session
            return None

    def end_session(self, session_id: str):
        """Gracefully end a session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.is_active = False
                logger.info(f"Session ended: {session_id[:8]}... ({session.turn_count} turns)")

    def get_active_count(self) -> int:
        """Number of currently active sessions."""
        with self._lock:
            return sum(1 for s in self._sessions.values() if s.is_active)

    def get_session_info(self, session_id: str) -> Optional[dict]:
        """Get session metadata (no conversation content)."""
        session = self.get_session(session_id)
        if not session:
            return None
        return {
            "session_id": session.session_id,
            "user_id": session.user_id[:8] + "...",
            "created_at": session.created_at,
            "last_activity": session.last_activity,
            "turn_count": session.turn_count,
            "is_active": session.is_active,
            "is_speaking": session.is_speaking,
            "is_listening": session.is_listening,
            "uptime_sec": round(time.time() - session.created_at, 1),
        }

    # ─── Private ───

    def _cleanup_loop(self):
        """Background thread: clean up expired sessions periodically."""
        while self._running:
            time.sleep(CLEANUP_INTERVAL_SEC)
            self._force_cleanup()

    def _force_cleanup(self):
        """Remove expired and inactive sessions."""
        with self._lock:
            expired = [
                sid for sid, s in self._sessions.items()
                if not s.is_active or s.is_expired()
            ]
            for sid in expired:
                session = self._sessions.pop(sid, None)
                if session:
                    uid = session.user_id
                    if uid in self._user_sessions:
                        self._user_sessions[uid] = [
                            s for s in self._user_sessions[uid] if s != sid
                        ]

            if expired:
                logger.info(f"Cleaned up {len(expired)} sessions. Active: {len(self._sessions)}")


# ─── Singleton ───
_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get or create the global session manager."""
    global _manager
    if _manager is None:
        _manager = SessionManager()
        _manager.start()
    return _manager
