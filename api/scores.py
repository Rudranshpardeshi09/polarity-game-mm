"""Polarity Drop leaderboard — Vercel Python serverless function.

GET  /api/scores          -> {"scores": [{"name", "score", "sector"}, ...]}   (top 10)
POST /api/scores {name, score, sector} -> {"rank": n, "scores": [...]}

Storage: Upstash Redis (free tier) through its REST API, so no extra Python packages are needed.
Set these env vars in Vercel (added automatically by the Upstash integration):
  KV_REST_API_URL / KV_REST_API_TOKEN   or   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
Without them the API answers 503 and the game falls back to local (browser) scores.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re
import secrets
import time
import urllib.request

BOARD_KEY = "pd:scores"
KEEP = 100                  # entries kept in the sorted set
TOP = 10                    # entries returned
RATE_LIMIT = 10             # submissions per IP per minute
NAME_RE = re.compile(r"^[A-Z0-9 _-]{1,12}$")
MAX_POINTS_PER_SECTOR = 8000   # generous plausibility cap (spec 01: strong run ≈ 4–6k by sector 6)


def redis_config():
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    return (url.rstrip("/"), token) if url and token else (None, None)


def redis(*command):
    """Run one Redis command over the Upstash REST API."""
    url, token = redis_config()
    req = urllib.request.Request(
        url,
        data=json.dumps([str(c) for c in command]).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        body = json.loads(res.read())
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]


def validate_entry(data):
    """Return a clean entry dict, or raise ValueError with a reason."""
    if not isinstance(data, dict):
        raise ValueError("body must be a JSON object")
    name = str(data.get("name", "")).strip().upper()
    if not NAME_RE.match(name):
        raise ValueError("name must be 1-12 chars: A-Z 0-9 space _ -")
    score, sector = data.get("score"), data.get("sector")
    if not isinstance(score, int) or isinstance(score, bool) or score < 0:
        raise ValueError("score must be a non-negative integer")
    if not isinstance(sector, int) or isinstance(sector, bool) or not 1 <= sector <= 99:
        raise ValueError("sector must be an integer 1-99")
    if score > MAX_POINTS_PER_SECTOR * sector:
        raise ValueError("score is not plausible for that sector")
    return {"name": name, "score": score, "sector": sector}


def parse_board(flat):
    """ZREVRANGE ... WITHSCORES returns [member, score, member, score, ...]."""
    out = []
    for i in range(0, len(flat), 2):
        try:
            meta = json.loads(flat[i])
            out.append({"name": meta["n"], "sector": meta["s"], "score": int(float(flat[i + 1]))})
        except (ValueError, KeyError, TypeError):
            continue
    return out


def top_scores():
    return parse_board(redis("ZREVRANGE", BOARD_KEY, 0, TOP - 1, "WITHSCORES"))


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not redis_config()[0]:
            return self.send_json(503, {"error": "leaderboard not configured"})
        try:
            self.send_json(200, {"scores": top_scores()})
        except Exception:
            self.send_json(502, {"error": "storage unavailable"})

    def do_POST(self):
        if not redis_config()[0]:
            return self.send_json(503, {"error": "leaderboard not configured"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 2048)
            entry = validate_entry(json.loads(self.rfile.read(length) or b"{}"))
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json(400, {"error": str(e)})

        try:
            ip = (self.headers.get("x-forwarded-for") or "unknown").split(",")[0].strip()
            rate_key = f"pd:rate:{ip}"
            count = int(redis("INCR", rate_key))
            if count == 1:
                redis("EXPIRE", rate_key, 60)
            if count > RATE_LIMIT:
                return self.send_json(429, {"error": "too many submissions, try again in a minute"})

            # member is unique per run; its JSON carries the display data
            member = json.dumps({"n": entry["name"], "s": entry["sector"], "t": int(time.time()), "r": secrets.token_hex(3)},
                                separators=(",", ":"))
            redis("ZADD", BOARD_KEY, entry["score"], member)
            redis("ZREMRANGEBYRANK", BOARD_KEY, 0, -(KEEP + 1))   # keep only the top KEEP
            rank = redis("ZREVRANK", BOARD_KEY, member)
            self.send_json(200, {"rank": None if rank is None else int(rank) + 1, "scores": top_scores()})
        except Exception:
            self.send_json(502, {"error": "storage unavailable"})
