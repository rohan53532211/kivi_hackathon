import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Mic,
  Square,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  RefreshCw,
  Edit3,
  Building2,
  Sparkles,
  ShieldAlert,
  Search,
  Check,
  ChevronRight,
  ExternalLink,
  Volume2
} from 'lucide-react';
import './App.css';

const CATEGORIES = ['Water/Plumbing', 'Electricity', 'Cleanliness', 'Other'];
const STATUSES = ['Submitted', 'In progress', 'Resolved'];

export default function App() {
  const [activeTab, setActiveTab] = useState('student'); // 'student' | 'staff'
  
  // Student Portal State
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Namaste! Welcome to Campus Awaaz. Apni complaint Hindi, English, ya Hinglish mein batayein (jaise: "Hall 5 ke washroom mein kal se paani nahi aa raha"). Main detail check karke official ticket ready karunga.'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Editable Draft State
  const [draft, setDraft] = useState({
    category: 'Water/Plumbing',
    location: '',
    description: '',
    occurred_when: ''
  });
  const [isDraftModified, setIsDraftModified] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState(null);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttTranscript, setSttTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Staff Dashboard State
  const [tickets, setTickets] = useState([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingTicketId, setUpdatingTicketId] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingChat]);

  // Load tickets when switching to staff dashboard
  useEffect(() => {
    if (activeTab === 'staff') {
      fetchTickets();
    }
  }, [activeTab, statusFilter, categoryFilter]);

  const fetchTickets = async () => {
    setIsLoadingTickets(true);
    try {
      let url = '/api/tickets?';
      if (statusFilter !== 'All') url += `status=${encodeURIComponent(statusFilter)}&`;
      if (categoryFilter !== 'All') url += `category=${encodeURIComponent(categoryFilter)}&`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      console.error(err);
      setErrorMessage('Could not load tickets. Please check server.');
    } finally {
      setIsLoadingTickets(false);
    }
  };

  // Chat message submission
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoadingChat) return;

    setErrorMessage('');
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoadingChat(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          current_draft: draft
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to get response from Sarvam AI');
      }

      const data = await res.json();
      
      // Add assistant response
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }

      // Update draft preview
      if (data.draft) {
        setDraft(prev => ({
          category: data.draft.category || prev.category || 'Other',
          location: data.draft.location || prev.location || '',
          description: data.draft.description || prev.description || '',
          occurred_when: data.draft.occurred_when || prev.occurred_when || ''
        }));
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error communicating with assistant.');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Maaf kijiye, connection issue aa gaya. Kripya dobara try karein.' }
      ]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Voice Recording Functions
  const startRecording = async () => {
    setErrorMessage('');
    setSttTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAndTranscribe(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      setErrorMessage('Microphone access denied or not available in this browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const uploadAndTranscribe = async (audioBlob) => {
    setIsTranscribing(true);
    setErrorMessage('');
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'complaint.webm');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Voice transcription failed.');
      }

      const data = await res.json();
      if (data.transcript) {
        setSttTranscript(data.transcript);
      } else {
        setErrorMessage('No speech detected in recording. Please try speaking clearly.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error during transcription.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const sendTranscribedText = () => {
    if (sttTranscript.trim()) {
      handleSendMessage(sttTranscript);
      setSttTranscript('');
    }
  };

  // Draft Confirm & Submit
  const handleConfirmSubmit = async () => {
    if (!draft.location.trim() || !draft.description.trim()) {
      setErrorMessage('Please ensure both Location and Description are filled before confirming.');
      return;
    }

    setIsSubmittingTicket(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to submit ticket');
      }

      const ticket = await res.json();
      setSubmittedTicket(ticket);
      // Reset draft
      setDraft({
        category: 'Water/Plumbing',
        location: '',
        description: '',
        occurred_when: ''
      });
      setIsDraftModified(false);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to save ticket to database.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // Staff status update
  const handleUpdateStatus = async (ticketId, newStatus) => {
    setUpdatingTicketId(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update status');
      
      setTickets(prev =>
        prev.map(t => (t.id === ticketId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t))
      );
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to update ticket status.');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.location.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-brand">
          <div className="brand-badge">
            <Building2 className="brand-icon" size={22} />
          </div>
          <div>
            <div className="brand-title">
              Campus Awaaz <span className="brand-hindi">कैम्पस आवाज़</span>
            </div>
            <div className="brand-subtitle">Smart Indic Grievance Assistant • Powered by Sarvam AI</div>
          </div>
        </div>

        <div className="nav-actions">
          <div className="tab-pill">
            <button
              className={`tab-btn ${activeTab === 'student' ? 'active' : ''}`}
              onClick={() => setActiveTab('student')}
            >
              <MessageSquare size={16} />
              <span>Student Portal</span>
            </button>
            <button
              className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
              onClick={() => setActiveTab('staff')}
            >
              <ShieldAlert size={16} />
              <span>Staff Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="alert-banner animate-fade-in">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
          <button className="alert-close" onClick={() => setErrorMessage('')}>×</button>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'student' ? (
        <main className="student-layout animate-fade-in">
          {/* Left Column: Chat & Voice Assistant */}
          <section className="chat-section">
            <div className="section-header">
              <div className="header-icon">
                <Sparkles size={18} />
              </div>
              <div>
                <h2>Lodge a Complaint</h2>
                <p>Type in Hinglish/Hindi/English or record voice. We'll structure it automatically.</p>
              </div>
            </div>

            {/* Quick Example Chips */}
            <div className="example-chips">
              <span className="chips-label">Try example:</span>
              <button
                className="chip"
                onClick={() => handleSendMessage('Hall 5 ke washroom mein kal se paani nahi aa raha.')}
              >
                💧 Hall 5 washroom paani
              </button>
              <button
                className="chip"
                onClick={() => handleSendMessage('Room 304 mein tube-light kharab ho gayi hai.')}
              >
                ⚡ Room 304 light
              </button>
              <button
                className="chip"
                onClick={() => handleSendMessage('Library 2nd floor pe dustbin overflow ho raha hai.')}
              >
                🧹 Library cleanliness
              </button>
            </div>

            {/* Chat Messages */}
            <div className="messages-box">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`message-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="message-sender">
                    {m.role === 'user' ? 'You' : 'Campus Awaaz Assistant'}
                  </div>
                  <div className="message-content">{m.content}</div>
                </div>
              ))}
              {isLoadingChat && (
                <div className="message-bubble assistant loading">
                  <div className="message-sender">Campus Awaaz Assistant</div>
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                    <span className="typing-text">Analyzing with Sarvam-105B...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Voice Recording Feedback Box */}
            {isRecording && (
              <div className="voice-status-box recording animate-fade-in">
                <div className="recording-indicator animate-pulse-recording"></div>
                <div className="recording-info">
                  <strong>Recording your voice complaint...</strong>
                  <span>{recordingSeconds}s • Speak naturally in Hindi, English, or Hinglish</span>
                </div>
                <button className="btn-stop-record" onClick={stopRecording}>
                  <Square size={16} /> Stop & Transcribe
                </button>
              </div>
            )}

            {isTranscribing && (
              <div className="voice-status-box transcribing animate-fade-in">
                <div className="spinner animate-spin"></div>
                <span>Transcribing audio with Sarvam Saaras v3...</span>
              </div>
            )}

            {sttTranscript && (
              <div className="transcript-review-box animate-fade-in">
                <div className="transcript-header">
                  <Volume2 size={16} className="text-primary" />
                  <strong>Voice Transcript (Review & Edit before sending):</strong>
                </div>
                <textarea
                  className="transcript-textarea"
                  value={sttTranscript}
                  onChange={(e) => setSttTranscript(e.target.value)}
                  rows={2}
                />
                <div className="transcript-actions">
                  <button className="btn-cancel" onClick={() => setSttTranscript('')}>Discard</button>
                  <button className="btn-send-transcript" onClick={sendTranscribedText}>
                    Send to Assistant <Send size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Chat Input Bar */}
            <div className="chat-input-bar">
              <button
                type="button"
                className={`btn-mic ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? 'Stop recording' : 'Record voice complaint'}
                disabled={isTranscribing || isLoadingChat}
              >
                {isRecording ? <Square size={18} /> : <Mic size={18} />}
              </button>

              <input
                type="text"
                className="chat-input"
                placeholder="Type your complaint... (e.g. Hall 5 2nd floor wing B)"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isLoadingChat || isRecording}
              />

              <button
                type="button"
                className="btn-send"
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isLoadingChat || isRecording}
              >
                <Send size={18} />
              </button>
            </div>
          </section>

          {/* Right Column: Live Editable Draft & Confirmation */}
          <section className="preview-section">
            <div className="section-header">
              <div className="header-icon highlight">
                <Edit3 size={18} />
              </div>
              <div>
                <h2>Complaint Draft Preview</h2>
                <p>Verify or edit details. No ticket is created until you confirm.</p>
              </div>
            </div>

            <div className="draft-card">
              <div className="draft-status-tag">
                {draft.location && draft.description ? (
                  <span className="tag-ready">
                    <Check size={14} /> Ready for confirmation
                  </span>
                ) : (
                  <span className="tag-gathering">
                    <Clock size={14} /> Gathering details from chat...
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Issue Category</label>
                <select
                  className="form-control"
                  value={draft.category}
                  onChange={(e) => {
                    setDraft({ ...draft, category: e.target.value });
                    setIsDraftModified(true);
                  }}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Campus Location (Hostel, Floor, Wing, Room)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Hall 5, 2nd Floor, Wing B Washroom"
                  value={draft.location}
                  onChange={(e) => {
                    setDraft({ ...draft, location: e.target.value });
                    setIsDraftModified(true);
                  }}
                />
              </div>

              <div className="form-group">
                <label>Problem Description</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="e.g. Kal se paani nahi aa raha hai, washroom taps dry"
                  value={draft.description}
                  onChange={(e) => {
                    setDraft({ ...draft, description: e.target.value });
                    setIsDraftModified(true);
                  }}
                />
              </div>

              <div className="form-group">
                <label>When Problem Started</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Since yesterday / Kal subah se"
                  value={draft.occurred_when}
                  onChange={(e) => {
                    setDraft({ ...draft, occurred_when: e.target.value });
                    setIsDraftModified(true);
                  }}
                />
              </div>

              <div className="draft-footer">
                <p className="draft-disclaimer">
                  ℹ️ Click below to generate an official trackable ticket in the campus system.
                </p>
                <button
                  className="btn-confirm-submit"
                  onClick={handleConfirmSubmit}
                  disabled={!draft.location.trim() || !draft.description.trim() || isSubmittingTicket}
                >
                  {isSubmittingTicket ? (
                    <>
                      <div className="spinner animate-spin" style={{ width: 16, height: 16 }}></div>
                      <span>Creating Ticket...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Confirm & Submit Ticket</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Submitted Ticket Receipt Card */}
            {submittedTicket && (
              <div className="submitted-ticket-card animate-fade-in">
                <div className="receipt-header">
                  <div className="receipt-icon">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3>Ticket Created Successfully!</h3>
                    <div className="receipt-id">Ticket ID: <strong>{submittedTicket.id}</strong></div>
                  </div>
                </div>

                <div className="status-tracker">
                  <div className="step active">
                    <div className="step-dot">1</div>
                    <span>Submitted</span>
                  </div>
                  <div className="step-line"></div>
                  <div className="step">
                    <div className="step-dot">2</div>
                    <span>In progress</span>
                  </div>
                  <div className="step-line"></div>
                  <div className="step">
                    <div className="step-dot">3</div>
                    <span>Resolved</span>
                  </div>
                </div>

                <div className="receipt-details">
                  <div><strong>Category:</strong> {submittedTicket.category}</div>
                  <div><strong>Location:</strong> {submittedTicket.location}</div>
                  <div><strong>Description:</strong> {submittedTicket.description}</div>
                  <div><strong>When:</strong> {submittedTicket.occurred_when}</div>
                </div>

                <div className="receipt-actions">
                  <button
                    className="btn-view-staff"
                    onClick={() => {
                      setActiveTab('staff');
                      fetchTickets();
                    }}
                  >
                    View in Staff Dashboard <ChevronRight size={16} />
                  </button>
                  <button
                    className="btn-lodge-another"
                    onClick={() => setSubmittedTicket(null)}
                  >
                    Lodge Another Complaint
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      ) : (
        /* Staff Operations Dashboard */
        <main className="staff-layout animate-fade-in">
          {/* Hackathon Demo Notice */}
          <div className="demo-banner">
            <ShieldAlert size={18} />
            <div>
              <strong>Campus Staff Operations View (Hackathon Demo Mode)</strong>
              <p>In production, this portal requires university staff credentials. Real-time updates persist directly to SQLite.</p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Total Tickets</div>
              <div className="metric-val">{tickets.length}</div>
            </div>
            <div className="metric-card warning">
              <div className="metric-label">Submitted</div>
              <div className="metric-val">{tickets.filter(t => t.status === 'Submitted').length}</div>
            </div>
            <div className="metric-card info">
              <div className="metric-label">In Progress</div>
              <div className="metric-val">{tickets.filter(t => t.status === 'In progress').length}</div>
            </div>
            <div className="metric-card success">
              <div className="metric-label">Resolved</div>
              <div className="metric-val">{tickets.filter(t => t.status === 'Resolved').length}</div>
            </div>
          </div>

          {/* Filtering and Search Controls */}
          <div className="dashboard-controls">
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search by ticket ID, location, or issue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <div className="filter-item">
                <Filter size={16} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="filter-item">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <button className="btn-refresh" onClick={fetchTickets} title="Refresh tickets">
                <RefreshCw size={16} className={isLoadingTickets ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Tickets Table / List */}
          <div className="tickets-container">
            {isLoadingTickets ? (
              <div className="loading-state">
                <div className="spinner animate-spin"></div>
                <p>Loading tickets from database...</p>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="empty-state">
                <Building2 size={36} />
                <h3>No tickets found</h3>
                <p>Try clearing filters or submit a new complaint from the Student Portal.</p>
              </div>
            ) : (
              <div className="tickets-table-wrapper">
                <table className="tickets-table">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Category</th>
                      <th>Location</th>
                      <th>Issue Description</th>
                      <th>When Started</th>
                      <th>Created</th>
                      <th>Status Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map(ticket => (
                      <tr key={ticket.id}>
                        <td className="ticket-id-cell">
                          <strong>{ticket.id}</strong>
                        </td>
                        <td>
                          <span className={`category-pill cat-${ticket.category.replace(/[\/\s]/g, '-').toLowerCase()}`}>
                            {ticket.category}
                          </span>
                        </td>
                        <td className="location-cell">
                          {ticket.location}
                        </td>
                        <td className="desc-cell">
                          {ticket.description}
                        </td>
                        <td className="when-cell">
                          {ticket.occurred_when}
                        </td>
                        <td className="date-cell">
                          {new Date(ticket.created_at).toLocaleDateString()} {new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <div className="status-action-cell">
                            <span className={`status-pill status-${ticket.status.replace(/\s/g, '-').toLowerCase()}`}>
                              {ticket.status}
                            </span>
                            <select
                              className="status-select"
                              value={ticket.status}
                              disabled={updatingTicketId === ticket.id}
                              onChange={(e) => handleUpdateStatus(ticket.id, e.target.value)}
                            >
                              {STATUSES.map(st => (
                                <option key={st} value={st}>Move to: {st}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
