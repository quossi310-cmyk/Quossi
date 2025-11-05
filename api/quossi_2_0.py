# api/quossi_2_0.py
# ==========================
# QUOSSI 2.1 — Emotional Memory Prototype (Serverless-ready)
# ==========================

import re
import json
import os
import hashlib
import base64
import random
from urllib import request as _urlrequest, parse as _urlparse
from statistics import mean, pstdev
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# --- Core Ranges ---
RANGES = [
    ("🌪 Storm", 100, 199, "The Reactor", "Fire", "Emotion first, logic later."),
    ("🌍 Ground", 200, 299, "The Builder", "Earth", "Steady hands make heavy bags."),
    ("🌊 Flow", 300, 399, "The Surfer", "Water", "Don’t fight the wave — ride it."),
    ("🏆 Gold", 400, 499, "The Strategist", "Air", "Silence wins faster."),
    ("☀️ Sun", 500, 600, "The Oracle", "Light", "Peace is the ultimate edge."),
]

# --- Config ---
# In serverless we shouldn't write to the project root. Use /tmp or an env-configured dir.
MEM_BASE_DIR = os.environ.get("QUOSSI_MEM_DIR", "/tmp")
MEMORY_FILE_TEMPLATE = "quossi_memory_{user}.json"
ROLLING_WINDOW = 10
SLOPE_WINDOW = 7

EMOTION_WEIGHTS = {
    "anxious": {
        "angry": 2, "mad": 2, "frustrated": 3, "lost": 2, "hate": 2, "sad": 2,
        "anxious": 3, "scared": 3, "panic": 3, "fear": 2, "stressed": 3
    },
    "positive": {
        "happy": 2, "grateful": 2, "confident": 3, "calm": 3, "peaceful": 3,
        "good": 1, "winning": 2, "profit": 2, "composed": 2, "focused": 1
    },
    "high-energy": {
        "excited": 3, "pumped": 3, "ready": 2, "motivated": 2, "amped": 3,
        "hyped": 3, "wired": 2
    },
    "neutral": {
        "nervous": 1, "unsure": 1, "maybe": 1, "confused": 2, "ok": 1, "fine": 1
    },
}

BASE_BY_TONE = {
    "anxious": 150,
    "neutral": 250,
    "positive": 350,
    "high-energy": 400,
}

# ---------- Helpers ----------

# Supabase integration (optional):
# - Set env SUPABASE_URL and SUPABASE_SERVICE_ROLE (or SUPABASE_ANON_KEY with proper RLS)
# - Expected tables:
#   qscore_history(user text, ts timestamptz, message text, qscore int, tone text)
#   qscore_state(user text primary key, memory jsonb, last_summary jsonb, updated_at timestamptz)
# These are written best-effort; if env is missing or tables not present, local file memory is used.

def _token_counts(msg: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for tone, weights in EMOTION_WEIGHTS.items():
        for token in weights:
            n = len(re.findall(rf"\b{re.escape(token)}\b", msg))
            if n:
                counts[token] = n
    return counts

def analyze_tone(message: str) -> str:
    msg = message.lower()
    counts = _token_counts(msg)
    scores = {tone: 0 for tone in EMOTION_WEIGHTS}

    for tone, weights in EMOTION_WEIGHTS.items():
        for token, w in weights.items():
            if token in counts:
                scores[tone] += w * counts[token]

    exclam = message.count("!")
    caps = sum(1 for c in message if c.isalpha() and c.isupper())
    scores["anxious"] += int(exclam * 0.5)
    scores["high-energy"] += int(max(0, caps - 8) * 0.2)

    if all(v == 0 for v in scores.values()):
        return "neutral"
    return max(scores.items(), key=lambda x: x[1])[0]

def emotional_stability(message: str) -> int:
    length = max(1, len(message))
    exclam_q = len(re.findall(r"[!?]", message))
    caps = sum(1 for c in message if c.isalpha() and c.isupper())
    repeats = len(re.findall(r"(.)\1{2,}", message))
    raw_instability = (exclam_q * 1.2) + (max(0, caps - 10) * 0.5) + (repeats * 2.0)
    normalized = raw_instability / (1 + (length / 120))
    score = max(0, 100 - int(round(normalized * 3)))
    return score

def _deterministic_jitter(message: str, span: int = 31) -> int:
    h = hashlib.md5(message.encode("utf-8")).hexdigest()
    v = int(h[:8], 16) % span  # 0..30
    return v - 15

def calculate_qscore(message: str) -> int:
    tone = analyze_tone(message)
    stability = emotional_stability(message)
    base = BASE_BY_TONE.get(tone, 250)
    adjusted = base + int((stability - 50) / 2)
    adjusted += _deterministic_jitter(message)
    return max(100, min(600, adjusted))

def assign_range(qscore: int):
    for name, low, high, archetype, element, motto in RANGES:
        if low <= qscore <= high:
            return {"name": name, "archetype": archetype, "element": element, "motto": motto}
    return {"name": "Unknown", "archetype": "-", "element": "-", "motto": "-"}

def hype_reflection(tone: str, qrange: dict, slope: float) -> str:
    trend_hint = (
        "You’re trending up — keep channeling that rhythm."
        if slope > 0.5 else
        "Tiny wobble — slow the breath, steady the hands."
        if slope < -0.5 else
        "You’re steady — consistency compounds."
    )
    reflections = {
        "anxious": f"You sound tense, but self-aware — {qrange['name']} energy. Breathe. Let’s steady those hands. {trend_hint}",
        "neutral": f"You’re composed — classic {qrange['name']} range. Builder focus on. {trend_hint}",
        "positive": f"Calm confidence detected — pure {qrange['name']} flow. Stay locked in. {trend_hint}",
        "high-energy": f"Hyped and focused — {qrange['name']} elite energy. Channel it with patience. {trend_hint}",
    }
    return reflections.get(tone, f"Clarity compounds. {trend_hint}")

def _memory_path(user: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", (user or "default").strip())
    os.makedirs(MEM_BASE_DIR, exist_ok=True)
    return os.path.join(MEM_BASE_DIR, MEMORY_FILE_TEMPLATE.format(user=safe))

def load_memory(user: str) -> dict:
    path = _memory_path(user)
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"user": user, "history": []}

def save_memory(user: str, memory: dict):
    try:
        path = _memory_path(user)
        with open(path, "w") as f:
            json.dump(memory, f, indent=2)
    except Exception:
        # Ignore write errors in serverless (read-only deployments, etc.)
        pass

# ---------- Supabase persistence (optional) ----------

def _supabase_cfg():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if url and key:
        return url.rstrip("/"), key
    return None, None

def _http_json(method: str, url: str, headers: dict, payload: dict | None = None) -> tuple[int, dict, str]:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = _urlrequest.Request(url, data=data, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with _urlrequest.urlopen(req, timeout=6) as resp:
            body = resp.read().decode("utf-8", "ignore")
            status = getattr(resp, 'status', 200)
            return status, dict(resp.headers), body
    except Exception as e:
        try:
            # If it's an HTTPError, it has .code and .read()
            if hasattr(e, 'code'):
                status = int(getattr(e, 'code', 500))
                body = getattr(e, 'read', lambda: b'')().decode('utf-8', 'ignore')
                return status, {}, body
        except Exception:
            pass
        return 0, {}, str(e)

def _supabase_headers(key: str) -> dict:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

def supabase_insert_history(user: str, ts_iso: str, message: str, qscore: int, tone: str, nickname: Optional[str] = None):
    url, key = _supabase_cfg()
    if not url or not key:
        return
    endpoint = f"{url}/rest/v1/qscore_history"
    headers = _supabase_headers(key)
    row = {
        "user": user,
        "ts": ts_iso,
        "message": message,
        "qscore": qscore,
        "tone": tone,
        "nickname": nickname,
    }
    _http_json("POST", endpoint, headers, [row])

def supabase_upsert_state(user: str, memory: dict, summary: dict):
    url, key = _supabase_cfg()
    if not url or not key:
        return
    # Requires a unique or PK on `user` in qscore_state
    endpoint = f"{url}/rest/v1/qscore_state?on_conflict=user"
    headers = _supabase_headers(key)
    row = {
        "user": user,
        "memory": memory,
        "last_summary": summary,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _http_json("POST", endpoint, headers, [row])

def supabase_fetch_latest_summary(user: str) -> dict | None:
    url, key = _supabase_cfg()
    if not url or not key:
        return None
    # Try state first
    qs = _urlparse.urlencode({
        "select": "last_summary",
        "user": f"eq.{user}",
        "limit": 1
    })
    endpoint = f"{url}/rest/v1/qscore_state?{qs}"
    headers = _supabase_headers(key)
    status, _, body = _http_json("GET", endpoint, headers)
    if status and 200 <= status < 300:
        try:
            rows = json.loads(body or "[]")
            if rows:
                ls = rows[0].get("last_summary")
                if isinstance(ls, dict):
                    return ls
        except Exception:
            pass
    # Fallback: build from latest history record
    qs2 = _urlparse.urlencode({
        "select": "ts,message,qscore,tone,nickname",
        "user": f"eq.{user}",
        "order": "ts.desc",
        "limit": 10,
    })
    endpoint2 = f"{url}/rest/v1/qscore_history?{qs2}"
    status2, _, body2 = _http_json("GET", endpoint2, headers)
    if status2 and 200 <= status2 < 300:
        try:
            rows = json.loads(body2 or "[]")
            if not rows:
                return None
            recent_scores = [r.get("qscore") for r in rows if isinstance(r.get("qscore"), int)]
            recent_scores = list(reversed(recent_scores))  # chronological
            main_q = weighted_main_qscore(recent_scores)
            vol = volatility(recent_scores)
            slope = _linear_slope(recent_scores[-SLOPE_WINDOW:]) if recent_scores else 0.0
            last = rows[0]
            qscore = int(last.get("qscore", 0) or 0)
            tone = last.get("tone", "neutral")
            nickname = last.get("nickname")
            qrange = assign_range(qscore)
            streak_dir, streak_len = streak_direction(recent_scores)
            reflection = hype_reflection(tone, qrange, slope)
            return {
                "user": user,
                "nickname": nickname,
                "tone": tone,
                "qscore": qscore,
                "range": qrange,
                "main_qscore": main_q,
                "trend_slope": slope,
                "volatility": vol,
                "streak": {"direction": streak_dir, "length": streak_len},
                "reflection": reflection,
            }
        except Exception:
            return None
    return None

def supabase_fetch_state_memory(user: str) -> dict | None:
    url, key = _supabase_cfg()
    if not url or not key:
        return None
    qs = _urlparse.urlencode({
        "select": "memory",
        "user": f"eq.{user}",
        "limit": 1,
    })
    endpoint = f"{url}/rest/v1/qscore_state?{qs}"
    headers = _supabase_headers(key)
    status, _, body = _http_json("GET", endpoint, headers)
    if status and 200 <= status < 300:
        try:
            rows = json.loads(body or "[]")
            if rows:
                mem = rows[0].get("memory")
                if isinstance(mem, dict):
                    return mem
        except Exception:
            return None
    return None

def update_memory(user: str, message: str, qscore: int, tone: str, nickname: Optional[str] = None) -> dict:
    memory = load_memory(user)
    if nickname:
        memory["nickname"] = nickname
    memory["history"].append({
        "ts": datetime.utcnow().isoformat() + "Z",
        "message": message,
        "qscore": qscore,
        "tone": tone
    })
    save_memory(user, memory)
    return memory

def weighted_main_qscore(scores: List[int]) -> Optional[int]:
    if not scores:
        return None
    n = len(scores)
    weights = list(range(1, n + 1))
    wavg = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
    return int(round(wavg))

def _linear_slope(y: List[float]) -> float:
    n = len(y)
    if n < 2:
        return 0.0
    x_sum = (n - 1) * n / 2
    x2_sum = (n - 1) * n * (2 * n - 1) / 6
    y_sum = sum(y)
    xy_sum = sum(i * yi for i, yi in enumerate(y))
    denom = n * x2_sum - x_sum ** 2
    if denom == 0:
        return 0.0
    return (n * xy_sum - x_sum * y_sum) / denom

def volatility(scores: List[int]) -> Optional[int]:
    if len(scores) < 2:
        return None
    return int(round(pstdev(scores)))

def streak_direction(scores: List[int]) -> Tuple[str, int]:
    if len(scores) < 2:
        return ("steady", 1)
    direction = "steady"
    length = 1
    for i in range(len(scores) - 1, 0, -1):
        diff = scores[i] - scores[i - 1]
        step_dir = "up" if diff > 0 else "down" if diff < 0 else "steady"
        if direction == "steady":
            direction = step_dir
            length = 1
        elif step_dir == direction and step_dir != "steady":
            length += 1
        else:
            break
    return (direction, length)

def compute_summary(message: str, user: str = "default", nickname: Optional[str] = None) -> dict:
    tone = analyze_tone(message)
    qscore = calculate_qscore(message)
    qrange = assign_range(qscore)
    memory = update_memory(user, message, qscore, tone, nickname)

    recent = [x["qscore"] for x in memory["history"][-ROLLING_WINDOW:]]
    main_q = weighted_main_qscore(recent)
    vol = volatility(recent)
    slope = _linear_slope(recent[-SLOPE_WINDOW:]) if recent else 0.0
    streak_dir, streak_len = streak_direction(recent)
    reflection = hype_reflection(tone, qrange, slope)

    return {
        "user": user,
        "nickname": memory.get("nickname") or nickname,
        "tone": tone,
        "qscore": qscore,
        "range": qrange,
        "main_qscore": main_q,
        "trend_slope": slope,
        "volatility": vol,
        "streak": {"direction": streak_dir, "length": streak_len},
        "reflection": reflection,
    }

# ---------- Vercel Python entrypoint ----------
def _parse_body(request: dict) -> dict:
    body = request.get("body")
    if body is None:
        return {}
    if request.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body).decode("utf-8", "ignore")
        except Exception:
            return {}
    try:
        return json.loads(body)
    except Exception:
        return {}

def handler(request):
    """
    Vercel serverless entrypoint.
    Expects:
      POST /api/quossi_2_0
      Body: { "answers": string[], "user": "optional-username" }
    Returns 200 {} on success (UI reads status only).
    """
    try:
      # Vercel Python passes a request object with attributes (method, headers, body, json())
      method = getattr(request, "method", "GET").upper()
      if method == "GET":
          user = "default"
          try:
              query = getattr(request, "args", None) or getattr(request, "query", None) or {}
              if isinstance(query, dict):
                  user = query.get("user") or user
          except Exception:
              pass
          if isinstance(request, dict):
              qsp = request.get("queryStringParameters") or {}
              if isinstance(qsp, dict) and qsp.get("user"):
                  user = qsp.get("user")

          # Prefer Supabase if configured
          sb = supabase_fetch_latest_summary(user)
          if sb is not None:
              return {
                  "statusCode": 200,
                  "headers": {"content-type": "application/json"},
                  "body": json.dumps(sb),
              }

          # Fallback to local memory
          mem = load_memory(user)
          hist = mem.get("history", [])
          if not hist:
              return {
                  "statusCode": 404,
                  "headers": {"content-type": "application/json"},
                  "body": json.dumps({"error": "No history for user"}),
              }
          recent = [x["qscore"] for x in hist[-ROLLING_WINDOW:]]
          main_q = weighted_main_qscore(recent)
          vol = volatility(recent)
          slope = _linear_slope(recent[-SLOPE_WINDOW:]) if recent else 0.0
          last = hist[-1]
          qscore = last.get("qscore", 0)
          tone = last.get("tone", "neutral")
          qrange = assign_range(qscore)
          streak_dir, streak_len = streak_direction(recent)
          reflection = hype_reflection(tone, qrange, slope)

          body = {
              "user": user,
              "nickname": mem.get("nickname"),
              "tone": tone,
              "qscore": qscore,
              "range": qrange,
              "main_qscore": main_q,
              "trend_slope": slope,
              "volatility": vol,
              "streak": {"direction": streak_dir, "length": streak_len},
              "reflection": reflection,
          }
          return {
              "statusCode": 200,
              "headers": {"content-type": "application/json"},
              "body": json.dumps(body),
          }
      if method != "POST":
          return {
              "statusCode": 405,
              "headers": {"allow": "GET,POST", "content-type": "application/json"},
              "body": json.dumps({"error": "Use GET to read or POST to update"}),
          }

      # Parse JSON body from Vercel's request object
      data = {}
      try:
          if hasattr(request, "json"):
              data = request.json() or {}
          else:
              body = getattr(request, "body", b"")
              if isinstance(body, (bytes, bytearray)):
                  body = body.decode("utf-8", "ignore")
              data = json.loads(body or "{}")
      except Exception:
          data = {}

      answers = data.get("answers")
      headers = getattr(request, "headers", {}) or {}
      user = (data.get("user") or headers.get("x-quossi-user") or "default")
      nickname = (data.get("nickname") or headers.get("x-quossi-nickname") or None)

      # Branch: Chat tracking event
      if data.get("chat") or data.get("event") == "chat":
          chat_msg = data.get("message")
          if not isinstance(chat_msg, str) or not chat_msg.strip():
              return {
                  "statusCode": 400,
                  "headers": {"content-type": "application/json"},
                  "body": json.dumps({"error": "Invalid chat message"}),
              }

          # Load memory from Supabase state (preferred) or local file
          mem = supabase_fetch_state_memory(user) or load_memory(user)
          chat_state = mem.get("chat_state") or {}
          count = int(chat_state.get("count", 0) or 0)
          threshold = int(chat_state.get("threshold", 0) or 0)
          buffer = chat_state.get("buffer") or []
          if not isinstance(buffer, list):
              buffer = []
          if threshold < 15 or threshold > 20:
              threshold = random.randint(15, 20)

          buffer.append(chat_msg.strip())
          count += 1

          if count < threshold:
              # Update state only
              mem["chat_state"] = {"count": count, "threshold": threshold, "buffer": buffer}
              save_memory(user, mem)
              try:
                  supabase_upsert_state(user, mem, (supabase_fetch_latest_summary(user) or {}))
              except Exception:
                  pass
              return {
                  "statusCode": 202,
                  "headers": {"content-type": "application/json"},
                  "body": json.dumps({"status": "queued", "count": count, "threshold": threshold}),
              }

          # Threshold reached: compute summary from buffered chat content
          combined = " | ".join(m for m in buffer if isinstance(m, str) and m.strip())
          out = compute_summary(combined, user=user, nickname=nickname)

          # Reset chat counter and buffer, pick a new threshold
          mem = supabase_fetch_state_memory(user) or load_memory(user)
          mem["nickname"] = mem.get("nickname") or nickname
          mem["chat_state"] = {"count": 0, "threshold": random.randint(15, 20), "buffer": []}
          save_memory(user, mem)

          # Persist to Supabase
          try:
              ts_iso = datetime.utcnow().isoformat() + "Z"
              supabase_insert_history(user, ts_iso, combined, int(out.get("qscore", 0) or 0), out.get("tone", "neutral"), out.get("nickname"))
              supabase_upsert_state(user, mem, out)
          except Exception:
              pass

          return {
              "statusCode": 200,
              "headers": {"content-type": "application/json"},
              "body": json.dumps(out),
          }

      # Branch: Form answers submission
      if not isinstance(answers, list) or not all(isinstance(x, str) for x in answers):
          return {
              "statusCode": 400,
              "headers": {"content-type": "application/json"},
              "body": json.dumps({"error": "Invalid payload: 'answers' must be a list of strings."}),
          }

      # Turn the 12 answers into one message. (You can change this mapping)
      message = " | ".join(a.strip() for a in answers if a and a.strip())

      # Compute and write memory (optional)
      out = compute_summary(message, user=user, nickname=nickname)

      # Best-effort: persist to Supabase if configured
      try:
          ts_iso = datetime.utcnow().isoformat() + "Z"
          supabase_insert_history(user, ts_iso, message, int(out.get("qscore", 0) or 0), out.get("tone", "neutral"), out.get("nickname"))
          mem = load_memory(user)
          supabase_upsert_state(user, mem, out)
      except Exception:
          pass

      return {
          "statusCode": 200,
          "headers": {"content-type": "application/json"},
          "body": json.dumps(out),
      }

    except Exception as e:
      return {
          "statusCode": 500,
          "headers": {"content-type": "application/json"},
          "body": json.dumps({"error": str(e)}),
      }

# ---------- CLI fallback (optional local testing) ----------
if __name__ == "__main__":
    # Keep a CLI path for manual local runs (not used by Vercel)
    print("QUOSSI 2.1 (CLI) — quick test")
    user = input("User: ").strip() or "default"
    msg = input("Tell me how your trading week felt:\n> ")
    out = compute_summary(msg, user=user)
    print(json.dumps(out, indent=2, ensure_ascii=False))
