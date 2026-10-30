"""OpenRouter LLM adapter (https://openrouter.ai/docs).

Connects ClauseLens to OpenRouter's unified chat completions API.
Supports model routing, reasoning models, JSON mode, and robust retry logic
for rate limits and upstream provider errors.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import httpx

from clauselens.adapters.http import json_body, send_with_retries
from clauselens.config import Settings
from clauselens.domain.errors import ConfigurationError, ErrorCategory, LLMError
from clauselens.observability import metrics
from clauselens.ports.llm import LLMRequest, LLMResponse

logger = logging.getLogger(__name__)

PROVIDER = "openrouter"


class OpenRouterLLMProvider:
    name = PROVIDER
    is_demo = False

    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        key = (
            (settings.openrouter_api_key.get_secret_value() if settings.openrouter_api_key else None)
            or (settings.llm_api_key.get_secret_value() if settings.llm_api_key else None)
        )
        if not key:
            raise ConfigurationError(
                "OPENROUTER_API_KEY (or LLM_API_KEY) is required when LLM_PROVIDER=openrouter",
                provider=PROVIDER,
            )

        self.model = settings.openrouter_model or settings.llm_model or "anthropic/claude-3.5-sonnet"
        self._settings = settings
        base = (settings.openrouter_base_url or "https://openrouter.ai/api/v1").rstrip("/")
        self._url = f"{base}/chat/completions"
        self._headers = {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://clauselens.app",
            "X-Title": "ClauseLens Fine-Print Analyzer",
            "Content-Type": "application/json",
        }
        self._client = client or httpx.Client(timeout=settings.llm_timeout_seconds)
        self._gate = threading.BoundedSemaphore(settings.llm_max_concurrency)

    def health_check(self) -> None:
        # Lightweight auth and availability verification
        try:
            resp = self._client.get(
                "https://openrouter.ai/api/v1/auth/key",
                headers=self._headers,
                timeout=10.0,
            )
            if resp.status_code == 401:
                raise LLMError("Invalid OpenRouter API key", category=ErrorCategory.AUTHENTICATION, provider=PROVIDER)
        except httpx.HTTPError:
            pass

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [m.model_dump() for m in request.messages],
            "temperature": request.temperature,
            "stream": False,
        }
        if request.max_output_tokens:
            payload["max_tokens"] = request.max_output_tokens

        # Support structured JSON mode if schema is provided or configured
        mode = self._settings.llm_output_mode
        if request.json_schema is not None and mode in {"json", "schema"}:
            payload["response_format"] = {"type": "json_object"}

        started = time.perf_counter()
        with self._gate:
            resp = send_with_retries(
                lambda: self._client.post(self._url, json=payload, headers=self._headers),
                provider=PROVIDER,
                operation=f"chat:{request.purpose}",
                max_retries=self._settings.llm_max_retries,
                error_cls=LLMError,
            )

        body = json_body(resp, provider=PROVIDER, operation="chat", error_cls=LLMError)

        if "error" in body and isinstance(body["error"], dict):
            err_data = body["error"]
            msg = err_data.get("message", "OpenRouter error")
            code = err_data.get("code")
            category = ErrorCategory.RATE_LIMIT if code == 429 else ErrorCategory.MALFORMED_OUTPUT
            raise LLMError(f"OpenRouter API error: {msg}", category=category, provider=PROVIDER)

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                "Chat completion response had no choices[0].message.content",
                category=ErrorCategory.MALFORMED_OUTPUT,
                provider=PROVIDER,
            ) from exc

        if not isinstance(content, str) or not content.strip():
            raise LLMError(
                "Model returned empty content",
                category=ErrorCategory.MALFORMED_OUTPUT,
                provider=PROVIDER,
            )

        usage = body.get("usage") if isinstance(body.get("usage"), dict) else {}
        metrics.inc("llm_requests_total", provider=PROVIDER, outcome="ok")
        return LLMResponse(
            text=content,
            model=str(body.get("model") or self.model),
            provider=PROVIDER,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            duration_ms=round((time.perf_counter() - started) * 1000, 1),
        )


def create(settings: Settings) -> OpenRouterLLMProvider:
    return OpenRouterLLMProvider(settings)
