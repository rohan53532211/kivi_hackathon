import os
import json
import sqlite3
import tempfile
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sarvamai import SarvamAI

# 1. Load .env credentials
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))

api_key = os.getenv("SARVAM_API_KEY")
if not api_key:
    print("[WARNING] SARVAM_API_KEY is not set in environment or .env!")

client = SarvamAI(api_subscription_key=api_key) if api_key else None

# 2. SQLite Database Setup
DB_PATH = Path(__file__).resolve().parent / "campus_awaaz.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            location TEXT NOT NULL,
            description TEXT NOT NULL,
            occurred_when TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()

# 3. FastAPI App Initialization
app = FastAPI(title="Campus Awaaz API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Data Models
class ChatMessage(BaseModel):
    role: str
    content: str

class ComplaintDraft(BaseModel):
    category: str = "Other"
    location: str = ""
    description: str = ""
    occurred_when: str = ""

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    current_draft: Optional[ComplaintDraft] = None

class TicketCreateRequest(BaseModel):
    category: str
    location: str
    description: str
    occurred_when: str

class StatusUpdateRequest(BaseModel):
    status: str

# 5. Helper function to call Sarvam AI for conversation and structured extraction
SYSTEM_PROMPT = """You are Campus Awaaz, an intelligent, empathetic campus grievance assistant for Indian university students.
Students describe issues in Hindi, English, or Hinglish (e.g., "Hall 5 ke washroom mein kal se paani nahi aa raha").

Your mission:
1. Extract or update the 4 key complaint fields:
   - category: Must be one of ["Water/Plumbing", "Electricity", "Cleanliness", "Other"]
   - location: Campus location with specific details (Hostel/Hall, Wing, Floor, Room/Area). E.g. "Hall 5, 2nd Floor, Wing B Washroom".
   - description: Concise summary of what is broken or needed.
   - occurred_when: When the issue started (e.g., "Since yesterday", "Kal se", "Past 3 days").

2. Retain all previously supplied information. Never erase details the student already told you.

3. If critical location details (like Floor, Wing, or Room number) or issue specifics are missing, ask ONE short, courteous follow-up question in Hinglish/Hindi or English (matching the student's vibe). Acknowledge what they already mentioned!

4. If all key details are present, politely ask the student to review and confirm the draft below.

5. You MUST respond with ONLY a valid JSON object in this exact format, with no markdown backticks, no comments, and no extra text:
{
  "reply": "Your conversational message or follow-up question here",
  "draft": {
    "category": "Water/Plumbing",
    "location": "Hall 5, 2nd Floor, Wing B",
    "description": "No running water in washroom",
    "occurred_when": "Since yesterday"
  },
  "is_complete": false
}
"""

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "sarvam_configured": bool(api_key),
        "database": str(DB_PATH.name),
    }

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    if not client:
        raise HTTPException(status_code=500, detail="SARVAM_API_KEY is not configured on the backend.")

    # Build prompt with history and current draft
    convo_history = []
    for m in req.messages:
        convo_history.append(f"{m.role.upper()}: {m.content}")
    history_str = "\n".join(convo_history)

    draft_context = ""
    if req.current_draft:
        draft_context = f"\nCurrent Known Draft State: {req.current_draft.model_dump_json()}"

    user_prompt = f"""Conversation so far:
{history_str}
{draft_context}

Please analyze the conversation, update the structured draft, ask for any missing location or issue details if needed, and respond with the JSON object."""

    try:
        response = client.chat.completions(
            model="sarvam-105b-conversations",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )

        content = response.choices[0].message.content.strip()
        
        # Clean potential markdown fences
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        try:
            parsed = json.loads(content)
            return parsed
        except json.JSONDecodeError:
            # Fallback if raw text returned
            return {
                "reply": content,
                "draft": req.current_draft.model_dump() if req.current_draft else {
                    "category": "Other",
                    "location": "",
                    "description": req.messages[-1].content if req.messages else "",
                    "occurred_when": "Not specified"
                },
                "is_complete": False
            }

    except Exception as e:
        print(f"[API ERROR] {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 6. Speech-to-Text Endpoint (Sarvam Saaras)
@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if not client:
        raise HTTPException(status_code=500, detail="SARVAM_API_KEY is not configured on the backend.")

    try:
        suffix = Path(file.filename or "recording.webm").suffix or ".webm"
        file_bytes = await file.read()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        try:
            with open(temp_path, "rb") as audio_fp:
                # Documented Sarvam STT API call
                stt_res = client.speech_to_text.transcribe(
                    file=audio_fp,
                    model="saaras:v3",
                    mode="transcribe",
                    language_code="unknown"
                )
            
            transcript = getattr(stt_res, "transcript", "")
            detected_lang = getattr(stt_res, "language_code", "unknown")
            return {
                "transcript": transcript,
                "language_code": detected_lang,
                "success": True
            }
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        print(f"[STT ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

# 7. Tickets CRUD Endpoints
@app.post("/api/tickets")
def create_ticket(req: TicketCreateRequest):
    if not req.location.strip() or not req.description.strip():
        raise HTTPException(status_code=400, detail="Location and description are required to submit a ticket.")

    valid_categories = ["Water/Plumbing", "Electricity", "Cleanliness", "Other"]
    category = req.category if req.category in valid_categories else "Other"

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Generate sequential or unique ID: CA-1001, CA-1002, etc.
    cursor.execute("SELECT COUNT(*) FROM tickets")
    count = cursor.fetchone()[0]
    ticket_id = f"CA-{1001 + count}"
    now_str = datetime.now().isoformat()

    cursor.execute("""
        INSERT INTO tickets (id, category, location, description, occurred_when, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'Submitted', ?, ?)
    """, (
        ticket_id,
        category,
        req.location.strip(),
        req.description.strip(),
        req.occurred_when.strip() or "Recently",
        now_str,
        now_str
    ))
    conn.commit()
    conn.close()

    return {
        "id": ticket_id,
        "category": category,
        "location": req.location.strip(),
        "description": req.description.strip(),
        "occurred_when": req.occurred_when.strip() or "Recently",
        "status": "Submitted",
        "created_at": now_str,
        "updated_at": now_str
    }

@app.get("/api/tickets")
def list_tickets(status: Optional[str] = None, category: Optional[str] = None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM tickets WHERE 1=1"
    params = []

    if status and status != "All":
        query += " AND status = ?"
        params.append(status)
    if category and category != "All":
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY datetime(created_at) DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    tickets = [dict(row) for row in rows]
    conn.close()
    return tickets

@app.patch("/api/tickets/{ticket_id}")
def update_ticket_status(ticket_id: str, req: StatusUpdateRequest):
    valid_statuses = ["Submitted", "In progress", "Resolved"]
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid_statuses}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now_str = datetime.now().isoformat()
    cursor.execute("""
        UPDATE tickets
        SET status = ?, updated_at = ?
        WHERE id = ?
    """, (req.status, now_str, ticket_id))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")

    conn.commit()
    conn.close()

    return {"id": ticket_id, "status": req.status, "updated_at": now_str}
