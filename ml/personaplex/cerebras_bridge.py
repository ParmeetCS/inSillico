"""
cerebras_bridge.py — Gemini AI LLM Bridge for Voice Pipeline
================================================================

Connects the PersonaPlex voice pipeline to Gemini AI (Google Gemma 3n)
via OpenRouter for reasoning and response generation.

Flow:
  1. Receive transcript from ASR
  2. Inject user context + conversation history
  3. Send to Gemini AI (OpenRouter) with system prompt
  4. Return response text for TTS synthesis

Uses the OpenRouter OpenAI-compatible API with google/gemma-3n-e4b-it:free.
"""

import os
import json
import time
import logging
from typing import Optional

import requests

logger = logging.getLogger("personaplex.gemini")

# ─── Configuration ───
# Priority: GEMINI_API_KEY (OpenRouter) → GROQ_API_KEY (Groq) → unconfigured

_gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
_groq_key = os.environ.get("GROQ_API_KEY", "").strip()

if _gemini_key:
    # Use OpenRouter / Gemini
    GEMINI_API_URL = "https://openrouter.ai/api/v1/chat/completions"
    GEMINI_API_KEY = _gemini_key
    GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "google/gemma-3n-e4b-it:free")
    logger.info("Voice LLM: OpenRouter (Gemini)")
elif _groq_key:
    # Fallback to Groq (OpenAI-compatible)
    GEMINI_API_URL = "https://api.groq.com/openai/v1/chat/completions"
    GEMINI_API_KEY = _groq_key
    GEMINI_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
    logger.info("Voice LLM: Groq")
else:
    GEMINI_API_URL = "https://openrouter.ai/api/v1/chat/completions"
    GEMINI_API_KEY = ""
    GEMINI_MODEL = "google/gemma-3n-e4b-it:free"
    logger.warning("No LLM API key found. Set GEMINI_API_KEY or GROQ_API_KEY.")

# Backward compatibility aliases
CEREBRAS_API_URL = GEMINI_API_URL
CEREBRAS_API_KEY = GEMINI_API_KEY
CEREBRAS_MODEL = GEMINI_MODEL

# ─── System Prompt (voice-optimized) ───

VOICE_SYSTEM_PROMPT = """You are the AI Research Assistant for InSilico Lab — an advanced in-silico drug discovery platform. You are responding via real-time voice.

## Expertise
- Medicinal chemistry, ADMET, SAR analysis, lead optimization
- LogP, pKa, TPSA, solubility, bioavailability, drug-likeness
- Toxicity screening: hERG, Ames, hepatotoxicity
- SMILES notation, molecular descriptors, QSPR models

## Voice Response Rules
- Speak naturally, as if explaining to a colleague at a whiteboard
- Keep responses concise: 3-6 sentences for simple queries, up to 10 for complex analysis
- Do NOT use markdown, tables, bullet points, or code blocks
- Spell out abbreviations first time: "topological polar surface area, or TPSA"
- For SMILES notation, describe the structure verbally
- Present the most important finding first, then supporting details
- End with a clear, actionable suggestion

## Tool Results
When you receive tool execution results, interpret them scientifically:
- Highlight key values and what they mean for drug development
- Flag any red flags (high toxicity, Lipinski violations, poor solubility)
- Compare against known drug benchmarks
- Suggest specific structural improvements

## QSPR Training Data Access
You can query the actual experimental training datasets using the query_qspr_dataset tool.
Available datasets:
  - Solubility: ESOL dataset — measured log solubility (logS mol/L), ~1128 compounds
  - Lipophilicity: MoleculeNet — experimental logD at pH 7.4, ~4200 compounds
  - BBB Penetration: BBBP dataset — binary blood-brain barrier permeability, ~2039 compounds
  - Clinical Toxicity: ClinTox — binary clinical trial toxicity, ~1478 compounds
When a user asks about "exact", "measured", "experimental", or "real" values for a molecule,
use query_qspr_dataset to look it up. If the molecule is in the dataset, report the measured
value and distinguish it clearly from ML predictions.
You can search by SMILES or by compound name.

## Tone
- Professional and scientifically precise
- Not casual, not over-confident
- Reference descriptor values numerically"""

# ─── Tool Definitions ───

VOICE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_prediction",
            "description": "Predict molecular properties (LogP, pKa, solubility, TPSA, bioavailability, toxicity) for a SMILES string.",
            "parameters": {
                "type": "object",
                "properties": {
                    "smiles": {
                        "type": "string",
                        "description": "SMILES notation of the molecule."
                    }
                },
                "required": ["smiles"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_drug_likeness",
            "description": "Assess drug-likeness (Lipinski, Veber, PAINS, QED) for a molecule.",
            "parameters": {
                "type": "object",
                "properties": {
                    "smiles": {
                        "type": "string",
                        "description": "SMILES notation of the molecule."
                    }
                },
                "required": ["smiles"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_descriptors",
            "description": "Compute molecular descriptors and physicochemical properties.",
            "parameters": {
                "type": "object",
                "properties": {
                    "smiles": {
                        "type": "string",
                        "description": "SMILES notation of the molecule."
                    }
                },
                "required": ["smiles"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_molecules",
            "description": "Compare two molecules side-by-side by predicting properties for both. Useful for SAR analysis or evaluating structural modifications.",
            "parameters": {
                "type": "object",
                "properties": {
                    "smiles_a": {
                        "type": "string",
                        "description": "SMILES of the first molecule."
                    },
                    "smiles_b": {
                        "type": "string",
                        "description": "SMILES of the second molecule."
                    },
                    "name_a": {
                        "type": "string",
                        "description": "Optional name for the first molecule."
                    },
                    "name_b": {
                        "type": "string",
                        "description": "Optional name for the second molecule."
                    }
                },
                "required": ["smiles_a", "smiles_b"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_qspr_dataset",
            "description": "Look up a molecule in the QSPR training datasets to get experimentally measured properties (solubility, lipophilicity, BBB penetration, clinical toxicity). Use this when the user asks for exact or measured values, training data, or experimental results for a specific molecule.",
            "parameters": {
                "type": "object",
                "properties": {
                    "smiles": {
                        "type": "string",
                        "description": "SMILES notation of the molecule to look up."
                    },
                    "name": {
                        "type": "string",
                        "description": "Common name of the molecule (e.g. 'Aspirin', 'Caffeine'). Used for name-based search."
                    }
                },
                "required": []
            }
        }
    },
]


class CerebrasBridge:
    """
    Bridge between PersonaPlex voice pipeline and Gemini AI (via OpenRouter).

    Handles:
      - System prompt construction with user context
      - Conversation history management
      - Tool call execution cycle
      - Response generation for TTS
    """

    def __init__(self):
        self.api_url = GEMINI_API_URL
        self.api_key = GEMINI_API_KEY
        self.model = GEMINI_MODEL
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://insillico.app",
            "X-Title": "InSilico Lab",
        })

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_response(
        self,
        messages: list,
        user_context: str = "",
        use_tools: bool = True,
        temperature: float = 0.7,
    ) -> dict:
        """
        Generate a response from Gemini AI via OpenRouter.

        Args:
            messages: Conversation history [{role, content}, ...]
            user_context: Formatted user research context string
            use_tools: Whether to enable function calling
            temperature: LLM temperature (0-1)

        Returns:
            {
                "text": str,         # Response text
                "tool_calls": list,  # Any tool calls made
                "usage": dict,       # Token usage
                "latency_ms": float  # Response time
            }
        """
        if not self.is_configured:
            return {
                "text": "The AI reasoning engine is not configured. Please set the GEMINI_API_KEY.",
                "tool_calls": [],
                "usage": {},
                "latency_ms": 0,
            }

        # Build system prompt with context
        system_content = VOICE_SYSTEM_PROMPT
        if user_context:
            system_content += f"\n\n---\n\n## User Research Context\n{user_context}"

        full_messages = [
            {"role": "system", "content": system_content},
            *messages,
        ]

        request_body = {
            "model": self.model,
            "messages": full_messages,
            "temperature": temperature,
            "top_p": 0.9,
            "max_tokens": 1024,  # Shorter for voice
        }

        if use_tools:
            request_body["tools"] = VOICE_TOOLS
            request_body["tool_choice"] = "auto"

        t_start = time.time()
        all_tool_calls = []

        # Execute with tool calling loop (max 3 iterations)
        for iteration in range(3):
            try:
                resp = self._session.post(
                    self.api_url,
                    json=request_body,
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.RequestException as e:
                logger.error(f"Gemini API error: {e}")
                return {
                    "text": "I encountered an error connecting to the reasoning engine. Please try again.",
                    "tool_calls": all_tool_calls,
                    "usage": {},
                    "latency_ms": round((time.time() - t_start) * 1000, 1),
                }

            choice = data.get("choices", [{}])[0]
            message = choice.get("message", {})
            finish_reason = choice.get("finish_reason", "stop")

            if finish_reason == "tool_calls" and message.get("tool_calls"):
                # Execute tool calls
                request_body["messages"].append(message)

                for tool_call in message["tool_calls"]:
                    fn_name = tool_call["function"]["name"]
                    try:
                        fn_args = json.loads(tool_call["function"]["arguments"])
                    except json.JSONDecodeError:
                        fn_args = {}

                    tool_result = self._execute_tool(fn_name, fn_args)
                    all_tool_calls.append({
                        "name": fn_name,
                        "args": fn_args,
                        "result_preview": tool_result[:200],
                    })

                    request_body["messages"].append({
                        "role": "tool",
                        "content": tool_result,
                        "tool_call_id": tool_call["id"],
                    })

                # Continue loop to get final response
                continue
            else:
                # Final response
                text = message.get("content", "")
                latency = round((time.time() - t_start) * 1000, 1)

                return {
                    "text": text,
                    "tool_calls": all_tool_calls,
                    "usage": data.get("usage", {}),
                    "latency_ms": latency,
                }

        # Fallback if tool loop exhausted
        return {
            "text": "I processed your request but couldn't finalize the response. Could you rephrase?",
            "tool_calls": all_tool_calls,
            "usage": {},
            "latency_ms": round((time.time() - t_start) * 1000, 1),
        }

    def _execute_tool(self, name: str, args: dict) -> str:
        """Execute a tool call against the ML backend."""
        ml_backend = os.environ.get("ML_BACKEND_URL", "http://localhost:5001")

        endpoint_map = {
            "run_prediction": "/predict",
            "get_descriptors": "/descriptors",
            "get_drug_likeness": "/drug-likeness",
            "query_qspr_dataset": "/qspr/lookup",
        }

        endpoint = endpoint_map.get(name)
        if not endpoint:
            # Handle compare_molecules separately (needs two SMILES)
            if name == "compare_molecules":
                try:
                    body = {
                        "smiles_a": args.get("smiles_a", ""),
                        "smiles_b": args.get("smiles_b", ""),
                    }
                    resp_a = requests.post(f"{ml_backend}/predict", json={"smiles": body["smiles_a"]}, timeout=15)
                    resp_b = requests.post(f"{ml_backend}/predict", json={"smiles": body["smiles_b"]}, timeout=15)
                    resp_a.raise_for_status()
                    resp_b.raise_for_status()
                    name_a = args.get("name_a", "Molecule A")
                    name_b = args.get("name_b", "Molecule B")
                    return json.dumps({"comparison": {
                        name_a: {"smiles": body["smiles_a"], **resp_a.json()},
                        name_b: {"smiles": body["smiles_b"], **resp_b.json()},
                    }})
                except Exception as e:
                    logger.error(f"compare_molecules error: {e}")
                    return json.dumps({"error": f"Comparison failed: {str(e)}"})
            return json.dumps({"error": f"Unknown tool: {name}"})

        try:
            # Build the request body based on the tool
            if name == "query_qspr_dataset":
                body = {}
                if args.get("smiles"):
                    body["smiles"] = args["smiles"]
                if args.get("name"):
                    body["name"] = args["name"]
            else:
                body = {"smiles": args.get("smiles", "")}

            resp = requests.post(
                f"{ml_backend}{endpoint}",
                json=body,
                timeout=15,
            )
            resp.raise_for_status()
            return json.dumps(resp.json())
        except Exception as e:
            logger.error(f"Tool execution error ({name}): {e}")
            return json.dumps({"error": f"Tool execution failed: {str(e)}"})

    def generate_streaming(
        self,
        messages: list,
        user_context: str = "",
        temperature: float = 0.7,
    ):
        """
        Generate a streaming response from Gemini AI via OpenRouter.

        Yields text chunks as they arrive.
        Note: Streaming mode does not support tool calling.
        """
        if not self.is_configured:
            yield "The AI reasoning engine is not configured."
            return

        system_content = VOICE_SYSTEM_PROMPT
        if user_context:
            system_content += f"\n\n---\n\n## User Research Context\n{user_context}"

        full_messages = [
            {"role": "system", "content": system_content},
            *messages,
        ]

        try:
            resp = self._session.post(
                self.api_url,
                json={
                    "model": self.model,
                    "messages": full_messages,
                    "temperature": temperature,
                    "top_p": 0.9,
                    "max_tokens": 1024,
                    "stream": True,
                },
                stream=True,
                timeout=30,
            )
            resp.raise_for_status()

            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue

        except Exception as e:
            logger.error(f"Gemini streaming error: {e}")
            yield "I encountered an error generating the response."


# ─── Singleton ───

_bridge: Optional[CerebrasBridge] = None


def get_cerebras_bridge() -> CerebrasBridge:
    """Get singleton CerebrasBridge (now uses Gemini AI via OpenRouter)."""
    global _bridge
    if _bridge is None:
        _bridge = CerebrasBridge()
    return _bridge
