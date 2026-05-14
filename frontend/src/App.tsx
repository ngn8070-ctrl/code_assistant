import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

const OPENROUTER_API_KEY ="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"; // 👈 your key here

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

function CodeBlock({ language, code, darkMode }: { language: string; code: string; darkMode: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        style={{
          position: "absolute", top: 8, right: 8,
          background: copied ? "#22c55e" : "#555",
          color: "white", border: "none", borderRadius: 6,
          padding: "4px 10px", cursor: "pointer", fontSize: 12, zIndex: 1,
        }}
      >
        {copied ? "✅ Copied!" : "📋 Copy"}
      </button>
      <SyntaxHighlighter
        language={language || "javascript"}
        style={darkMode ? vscDarkPlus : oneLight}
        customStyle={{ borderRadius: 8, padding: 16, fontSize: 14 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("dark-mode") !== "false";
  });

  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem("all-chats");
    return saved ? JSON.parse(saved) : [];
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return localStorage.getItem("active-chat-id") || null;
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const messages = activeChat?.messages || [];

  useEffect(() => {
    localStorage.setItem("all-chats", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("dark-mode", String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (activeChatId) localStorage.setItem("active-chat-id", activeChatId);
  }, [activeChatId]);

  useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "auto" });
}, [streamingText]);

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);

  const theme = {
    bg: darkMode ? "#121212" : "#f5f5f5",
    header: darkMode ? "#1a1a1a" : "#ffffff",
    sidebar: darkMode ? "#161616" : "#f0f0f0",
    sidebarHover: darkMode ? "#2a2a2a" : "#e0e0e0",
    sidebarActive: darkMode ? "#0070f3" : "#0070f3",
    border: darkMode ? "#2a2a2a" : "#e0e0e0",
    bubble: darkMode ? "#1e1e1e" : "#ffffff",
    text: darkMode ? "#d4d4d4" : "#111111",
    input: darkMode ? "#2a2a2a" : "#ffffff",
    subText: darkMode ? "#666" : "#999",
  };  

  // Create a new chat
  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput("");
    setStreamingText("");
  };

  // Delete a chat
  const deleteChat = (id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(chats.find((c) => c.id !== id)?.id || null);
    }
  };

  // Update messages in active chat
  const updateChatMessages = (chatId: string, newMessages: Message[]) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        // Auto title from first user message
        const title = newMessages.find((m) => m.role === "user")?.content.slice(0, 20) || "New Chat";
        return { ...c, messages: newMessages, title };
      })
    );
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    // Auto create a chat if none selected
    let chatId = activeChatId;
    if (!chatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
      };
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      chatId = newChat.id;
    }

    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    updateChatMessages(chatId, updatedMessages);
    setInput("");
    setLoading(true);
    setStreamingText("");

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Code Assistant",
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-nano-30b-a3b:free",
          stream: true,
          messages: [
            {
              role: "system",
              content: "You are an expert coding assistant. Help users write, fix, and understand code clearly.",
            },
            ...updatedMessages,
          ],
        }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.replace("data: ", "").trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content || "";
            fullReply += token;
            setStreamingText(fullReply);
          } catch { }
        }
      }

      const finalMessages = [...updatedMessages, { role: "assistant" as const, content: fullReply }];
      updateChatMessages(chatId, finalMessages);
      setStreamingText("");

    } catch (error: any) {
      const finalMessages = [...updatedMessages, { role: "assistant" as const, content: `❌ Error: ${error.message}` }];
      updateChatMessages(chatId, finalMessages);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (content: string) => (
    <ReactMarkdown
      components={{
        code({ className, children }) {
          const language = className?.replace("language-", "") || "javascript";
          const code = String(children).trim();
          return <CodeBlock language={language} code={code} darkMode={darkMode} />;
        },
        p({ children }) {
          return <p style={{ margin: "4px 0" }}>{children}</p>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  return (
    <div style={{
      display: "flex", height: "100vh",
      background: theme.bg, color: theme.text,
      fontFamily: "sans-serif", transition: "all 0.3s ease",
    }}>

      {/* ── SIDEBAR ── */}
      {sidebarOpen && (
        <div style={{
          width: 260, background: theme.sidebar,
          borderRight: `1px solid ${theme.border}`,
          display: "flex", flexDirection: "column",
          transition: "all 0.3s ease",
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: "16px 12px",
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <button
              onClick={createNewChat}
              style={{
                width: "100%", padding: "10px",
                background: "#0070f3", color: "white",
                border: "none", borderRadius: 8,
                cursor: "pointer", fontSize: 14, fontWeight: "bold",
              }}
            >
              ✏️ New Chat
            </button>
          </div>

          {/* Chat List */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {chats.length === 0 && (
              <p style={{ color: theme.subText, fontSize: 13, textAlign: "center", marginTop: 20 }}>
                No chats yet. Click "New Chat"!
              </p>
            )}
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "10px 12px",
                  borderRadius: 8, marginBottom: 4, cursor: "pointer",
                  background: chat.id === activeChatId ? theme.sidebarActive : "transparent",
                  color: chat.id === activeChatId ? "white" : theme.text,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (chat.id !== activeChatId)
                    (e.currentTarget as HTMLDivElement).style.background = theme.sidebarHover;
                }}
                onMouseLeave={(e) => {
                  if (chat.id !== activeChatId)
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                <span style={{
                  fontSize: 13, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  💬 {chat.title}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                  style={{
                    background: "transparent", border: "none",
                    color: chat.id === activeChatId ? "white" : theme.subText,
                    cursor: "pointer", fontSize: 16, padding: "0 4px",
                    flexShrink: 0,
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          {/* Sidebar Footer */}
          <div style={{
            padding: 12, borderTop: `1px solid ${theme.border}`,
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, color: theme.subText }}>
              {chats.length} chat{chats.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              style={{
                background: "transparent", border: "none",
                cursor: "pointer", fontSize: 18,
              }}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN CHAT AREA ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{
          padding: "14px 20px", background: theme.header,
          borderBottom: `1px solid ${theme.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "transparent", border: "none",
                color: theme.text, cursor: "pointer", fontSize: 20,
              }}
            >
              ☰
            </button>
            <span style={{ fontSize: 18, fontWeight: "bold" }}>
              💻 Code Assistant
            </span>
          </div>
          <button
            onClick={createNewChat}
            style={{
              background: "#0070f3", color: "white", border: "none",
              borderRadius: 8, padding: "6px 14px",
              cursor: "pointer", fontSize: 13,
            }}
          >
            ✏️ New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="message-container" style={{ flex: 1, overflowY: "auto", padding: 24, overflowAnchor: "none" as any }}>
          {!activeChat && (
            <div style={{ textAlign: "center", color: theme.subText, marginTop: 80 }}>
              <div style={{ fontSize: 56 }}>🤖</div>
              <p style={{ fontSize: 18 }}>Welcome to Code Assistant!</p>
              <p style={{ fontSize: 13 }}>Click "✏️ New Chat" to get started</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16, alignItems: "flex-start",
            }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#0070f3", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 18, marginRight: 8, flexShrink: 0,
                }}>🤖</div>
              )}
              <div style={{
                maxWidth: "75%",
                background: msg.role === "user" ? "#0070f3" : theme.bubble,
                color: msg.role === "user" ? "white" : theme.text,
                padding: "10px 16px",
                borderRadius: msg.role === "user"
                  ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                boxShadow: darkMode ? "none" : "0 1px 4px rgba(0,0,0,0.08)",
              }}>
                {msg.role === "user"
                  ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                  : renderMessage(msg.content)
                }
              </div>
              {msg.role === "user" && (
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#444", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 18, marginLeft: 8, flexShrink: 0,
                }}>👤</div>
              )}
            </div>
          ))}

          {streamingText && (
  <div style={{ display: "flex", marginBottom: 16, alignItems: "flex-start", minHeight: 60 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#0070f3", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 18, marginRight: 8, flexShrink: 0,
              }}>🤖</div>
              <div style={{
                maxWidth: "75%", background: theme.bubble, color: theme.text,
                padding: "10px 16px", borderRadius: "18px 18px 18px 4px",
              }}>
                {renderMessage(streamingText)}
                <span style={{ animation: "blink 1s infinite", color: "#0070f3" }}>▌</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: 16, background: theme.header,
          borderTop: `1px solid ${theme.border}`,
          display: "flex", gap: 8,
        }}>
          <textarea
            rows={2}
            style={{
              flex: 1, padding: 12, borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: theme.input, color: theme.text,
              fontSize: 15, resize: "none", outline: "none",
              transition: "all 0.3s ease",
            }}
            placeholder={activeChat ? "Ask me to write or fix code..." : "Start a new chat first..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{
              padding: "10px 20px",
              background: loading ? "#444" : "#0070f3",
              color: "white", border: "none", borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer", fontSize: 16,
            }}
          >
            {loading ? "⏳" : "Send ➤"}
          </button>
        </div>
      </div>

     <style>{`
  /* previous styles stay same, ADD this: */
  
  * {
    box-sizing: border-box;
  }

  /* Stops layout jumping while streaming */
  .message-container {
    overflow-anchor: auto;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  pre {
    overflow-x: auto !important;
    max-width: 100% !important;
    white-space: pre-wrap !important;
    word-break: break-word !important;
  }

  code {
    white-space: pre-wrap !important;
    word-break: break-word !important;
  }

  p {
    word-break: break-word !important;
    overflow-wrap: break-word !important;
  }
`}</style>
    </div>
  );
}   