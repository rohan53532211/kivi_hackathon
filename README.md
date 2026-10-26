# Campus Awaaz (कैम्पस आवाज़) 🎙️🏛️
### Smart Multilingual Campus Grievance Portal — Powered by Sarvam AI

Campus Awaaz is an AI-powered student grievance resolution system tailored for Indian college campuses. Students can submit complaints naturally via text or voice in **Hindi, English, or Hinglish** (e.g., *"Hall 5 ke washroom mein kal se paani nahi aa raha"*). The system uses **Sarvam AI** to clarify missing location details, extract structured ticket metadata, and manage persistent tickets on a staff operations dashboard.

---

## 🌟 Key Features

1. **Multilingual Hinglish & Indic Processing**:
   - Powered by **`sarvam-105b-conversations`** to comprehend regional contexts, colloquial phrasing, and code-mixed inputs.
2. **Context-Retaining Follow-Ups**:
   - Analyzes student complaints and asks targeted follow-ups in friendly Hinglish for missing location details (Hostel/Hall, Wing, Floor, Room).
3. **Voice Recording with Speech-to-Text**:
   - Built-in microphone recording integrated with Sarvam's **`saaras:v3`** model.
   - Includes an **Editable Transcript Review Box** allowing students to correct phonetic or regional transcriptions before sending.
4. **Editable Complaint Preview**:
   - Auto-fills Category (`Water/Plumbing`, `Electricity`, `Cleanliness`, `Other`), Location, Description, and Occurrence timing.
   - Requires explicit confirmation before a ticket is officially created.
5. **Persistent Ticket Management**:
   - SQLite-backed ticket database with unique IDs (e.g., `CA-1001`).
   - 3-step lifecycle: `Submitted` ➔ `In progress` ➔ `Resolved`.
6. **Campus Staff Operations Dashboard**:
   - Overview metrics, category/status filters, keyword search, and one-click status transitions.
   - Labeled for Hackathon Demo mode.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Environment Setup
Clone the repository and create your `.env` file in the root directory:
```bash
cp .env.example .env
```
Add your Sarvam AI API subscription key to `.env`:
```env
SARVAM_API_KEY=your_actual_sarvam_key_here
```

### 3. Backend Setup
```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install sarvamai fastapi "uvicorn[standard]" python-multipart

# Start the FastAPI server
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser!

---

## 🛠️ Tech Stack
- **AI & NLP**: [Sarvam AI SDK](https://docs.sarvam.ai) (`sarvam-105b-conversations` for chat/reasoning, `saaras:v3` for STT)
- **Backend**: FastAPI, SQLite3, Python
- **Frontend**: React, Vite, Lucide Icons, Modern Vanilla CSS Design System
