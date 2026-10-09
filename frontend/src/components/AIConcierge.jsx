import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles, X, Volume2 } from "lucide-react";
import { API } from "../lib/api";

const SUGGESTIONS = [
  "Plan a 4-day Goa trip for 2 under ₹25,000",
  "Best honeymoon destinations in India for January",
  "Udaipur me kaunsa heritage hotel best hai?",
  "मुझे मालदीव के लिए 5 दिन का प्लान चाहिए",
];

export default function AIConcierge() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Namaste! Main DestinoWay AI concierge. Mujhe apni language me bataiye — destination, dates, budget — main perfect plan bana doonga. (Hindi, English, Bengali, Tamil, Telugu, Marathi — jo bhi aapko comfortable ho.)" },
  ]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("auto");
  const recognition = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const send = async (preset) => {
    const t = (preset || text).trim();
    if (!t) return;
    setText("");
    setMessages((old) => [...old, { role: "user", text: t }, { role: "assistant", text: "", streaming: true }]);
    try {
      const resp = await fetch(`${API}/chat/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t, language: lang, context: {} }),
      });
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop();
        chunks.forEach((chunk) => {
          const line = chunk.split("\n").find((x) => x.startsWith("data: "));
          if (!line) return;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.text) {
              answer += ev.text;
              setMessages((old) => [...old.slice(0, -1), { role: "assistant", text: answer }]);
            }
          } catch { /* ignore parse errors */ }
        });
      }
      if (answer && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(answer);
        // simple heuristic: pick Hindi voice if script contains Devanagari
        const hasDev = /[\u0900-\u097F]/.test(answer);
        u.lang = hasDev ? "hi-IN" : "en-IN";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {
      setMessages((old) => [...old.slice(0, -1), { role: "assistant", text: "Concierge se connect nahi ho pa raha. Thodi der me try karein." }]);
    }
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const r = new SR();
    r.lang = lang === "auto" ? "en-IN" : lang;
    r.interimResults = false;
    r.onresult = (e) => { const said = e.results[0][0].transcript; setText(said); send(said); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognition.current = r; r.start(); setListening(true);
  };

  if (!open) {
    return (
      <button className="concierge-fab" onClick={() => setOpen(true)} data-testid="concierge-open" aria-label="Open AI travel concierge">
        <Sparkles size={22}/>
      </button>
    );
  }

  return (
    <div className="concierge-panel" data-testid="concierge-panel">
      <div className="concierge-head">
        <div className="concierge-title">
          <span style={{width:36,height:36,background:'var(--teal)',color:'#06131a',borderRadius:'50%',display:'grid',placeItems:'center'}}><Sparkles size={16}/></span>
          <div>
            <strong>DestinoWay AI</strong>
            <small>MULTILINGUAL CONCIERGE</small>
          </div>
        </div>
        <button className="concierge-close" onClick={() => setOpen(false)} data-testid="concierge-close"><X size={20}/></button>
      </div>
      <div className="chat-messages" data-testid="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="chat-avatar">{m.role === "assistant" ? <Sparkles size={13}/> : "You"}</div>
            <div className="bubble" data-testid={`chat-message-${i}`}>{m.text || "…"}</div>
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      {messages.length <= 2 && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => send(s)} data-testid={`suggestion-${i}`}>{s}</button>
          ))}
        </div>
      )}
      <div className="chat-compose">
        <button className={listening ? "icon-btn listening" : "icon-btn"} onClick={toggleVoice} data-testid="voice-input-button" aria-label="Voice input"><Mic size={16}/></button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Apni language me bataiye…"
          data-testid="chat-input"
        />
        <button className="icon-btn primary" onClick={() => send()} data-testid="send-chat-button" aria-label="Send"><Send size={16}/></button>
      </div>
      <div style={{padding:'0 20px 14px',color:'var(--muted)',fontSize:11,display:'flex',alignItems:'center',gap:6}}>
        <Volume2 size={12}/> Replies are spoken aloud. Hindi, English, Bengali, Tamil & more supported.
      </div>
    </div>
  );
}
