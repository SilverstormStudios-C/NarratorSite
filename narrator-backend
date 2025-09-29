import os, json, time, re
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ---- Config via env ----
# Choose ONE of these backends:
# 1) OpenAI-compatible provider (recommended for Render)
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "").rstrip("/")  # e.g. https://api.openai.com/v1 OR https://openrouter.ai/api/v1 OR https://api.together.xyz/v1
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL    = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # or "meta-llama/llama-3-8b-instruct" on OpenRouter, etc.

# 2) Ollama (optional; if you self-host elsewhere)
OLLAMA_URL      = os.getenv("OLLAMA_URL", "").rstrip("/")   # e.g. https://your-ollama-host:11434
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

# simple demo logins (client also has these)
USERS = {"Admin1":"admin"} | {f"PS{i}": f"guest{i}" for i in range(1,11)}

def chat_openai(messages, temperature=1.05, max_tokens=340):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }
    body = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "temperature": float(temperature),
        "top_p": 0.92,
        "max_tokens": int(max_tokens)
    }
    url = f"{OPENAI_API_BASE}/chat/completions"
    r = requests.post(url, headers=headers, json=body, timeout=120)
    r.raise_for_status()
    j = r.json()
    return j["choices"][0]["message"]["content"]

def chat_ollama(messages, temperature=1.05, max_tokens=340):
    url = f"{OLLAMA_URL}/api/chat"
    body = {"model": OLLAMA_MODEL, "messages": messages, "stream": False,
            "options": {"temperature": float(temperature), "top_p": 0.92, "repeat_penalty": 1.12, "num_predict": int(max_tokens)}}
    r = requests.post(url, json=body, timeout=120)
    r.raise_for_status()
    j = r.json()
    return j.get("message",{}).get("content","")

def select_backend():
    if OPENAI_API_BASE and OPENAI_API_KEY:
        return "openai"
    if OLLAMA_URL:
        return "ollama"
    return None

def build_system(state, mode, ooc, style, temperature, max_tokens):
    STYLE = {
        "default":"", "noir":"STYLE OVERRIDE: moody, staccato, smoky noir tension.",
        "romance":"STYLE OVERRIDE: intimate, yearning, soft sensory detail.",
        "action":"STYLE OVERRIDE: kinetic verbs, quick cuts, external stakes."
    }.get(style,"")
    mode_text = "MODE: RP — second-person, interactive; include a small hook/choice." if mode=="rp" else \
                "MODE: STORY — third-person mini-chapter; no choices, keep momentum."
    ooc_text  = "OOC ENABLED: step out only when asked; otherwise stay immersed." if ooc else \
                "OOC DISABLED: stay fully in-world."
    mems = state.get("memories", [])
    mem_block = "\n\nMEMORY:\n- " + "\n- ".join(m.get("text","") for m in mems[-12:]) if mems else ""
    dials = {"temperature":temperature, "max_tokens":max_tokens, "style":style}
    return f"""ADULTS-ONLY RP/STORY ENGINE — FICTION ONLY
Never provide real-world how-to. Adults only in NSFW. Fade to black if lines are crossed.
STYLE: cinematic, sensory; keep continuity; end with a small HOOK.

{STYLE}
{mode_text}
{ooc_text}

DIALS: {json.dumps(dials)}
OUTLINE: {state.get("outline") or "[EMPTY]"}
LOREBOOK: {state.get("lorebook") or "[EMPTY]"}
CURRENT GOAL/BEAT: {state.get("goal") or "[EMPTY]"}{mem_block}
"""

# ---- In-memory store (Render free dyno will reset on redeploy; good enough to start) ----
STORE = {}  # key = (user, story_id) -> {"history":[[u,b],...], "outline":"", "lorebook":"", "goal":"", "memories":[]}

def get_state(user, story_id):
    return STORE.setdefault((user, story_id), {"history":[], "outline":"", "lorebook":"", "goal":"", "memories":[]})

@app.post("/api/login")
def login():
    pw = (request.json or {}).get("password","").strip()
    role = USERS.get(pw)
    if not role: return jsonify({"ok":False,"error":"invalid_password"}), 401
    return jsonify({"ok":True, "user": role})

@app.post("/api/state/get")
def state_get():
    j = request.json or {}
    user = j.get("user","guest")
    story_id = j.get("story_id","default")
    return jsonify({"ok":True, "state": get_state(user, story_id)})

@app.post("/api/state/save")
def state_save():
    j = request.json or {}
    user = j.get("user","guest"); story_id = j.get("story_id","default")
    state = j.get("state") or {}
    STORE[(user,story_id)] = state
    return jsonify({"ok":True})

@app.post("/api/send")
def send():
    j = request.json or {}
    user = j.get("user","guest"); story_id = j.get("story_id","default")
    message = (j.get("message") or "").strip()
    if not message: return jsonify({"ok":False,"error":"empty_message"}), 400

    mode = j.get("mode","rp"); ooc = bool(j.get("ooc", False))
    style = j.get("style","default")
    temperature = float(j.get("temperature",1.05))
    max_tokens  = int(j.get("max_tokens",340))

    state = get_state(user, story_id)
    state["history"].append([message, "..."])

    system = build_system(state, mode, ooc, style, temperature, max_tokens)
    keep = [pair for pair in state["history"][-6:] if pair[1] != "..."]
    messages = [{"role":"system","content":system}]
    for u,b in keep:
        messages += [{"role":"user","content":u},{"role":"assistant","content":b}]
    messages.append({"role":"user","content":message})

    backend = select_backend()
    try:
        if backend == "openai":
            reply = chat_openai(messages, temperature, max_tokens)
        elif backend == "ollama":
            reply = chat_ollama(messages, temperature, max_tokens)
        else:
            reply = "[Server not configured: set OPENAI_API_BASE+OPENAI_API_KEY or OLLAMA_URL]"
    except Exception as e:
        reply = f"[Backend error: {e}]"

    # light auto-memory extraction
    m = re.search(r"(?:remember|note|rule)[:\-]\s*(.+)", reply, re.I)
    if m:
        state.setdefault("memories", []).append({"id": str(int(time.time()))[-6:], "text": m.group(1).strip()})

    state["history"][-1][1] = reply
    return jsonify({"ok":True, "reply": reply, "state": state})

@app.get("/")
def root():
    return jsonify({"ok":True, "msg":"Narrator backend up"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT","10000")))
