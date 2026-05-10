/* ============================================================
   MedExpert – Vanilla JavaScript Application
   ============================================================ */

(function () {
  "use strict";

  // ------------------------------------------------------------------
  // SVG Icons (inlined to avoid external icon dependency)
  // ------------------------------------------------------------------
  const ICONS = {
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    messageSquare: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    panelOpen: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="14 9 17 12 14 15"/></svg>`,
    stethoscope: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`,
    send: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    loader: `<svg class="spin" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
  };

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const STORAGE_CONV_KEY = "medexpert-conversations";
  const STORAGE_SETTINGS_KEY = "medexpert-settings";

  const DEFAULT_SETTINGS = { showConfidence: true, confidenceThreshold: 80 };

  let conversations = loadJSON(STORAGE_CONV_KEY, []);
  let settings = loadJSON(STORAGE_SETTINGS_KEY, DEFAULT_SETTINGS);
  let activeId = conversations.length > 0 ? conversations[0].id : null;
  let isLoading = false;
  let sidebarOpen = window.innerWidth > 768;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : (
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      })
    );
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function saveConversations() { localStorage.setItem(STORAGE_CONV_KEY, JSON.stringify(conversations)); }
  function saveSettings() { localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings)); }

  function getActive() { return conversations.find((c) => c.id === activeId) || null; }

  // ------------------------------------------------------------------
  // Simple Markdown renderer (covers common patterns)
  // ------------------------------------------------------------------
  function renderMarkdown(text) {
    if (!text) return "";
    let html = text
      // Escape HTML
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Unordered list items
      .replace(/^[\-\*]\s+(.+)$/gm, "<li>$1</li>")
      // Ordered list items
      .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

    // Paragraphs: split by double newlines
    html = html.split(/\n{2,}/).map((block) => {
      block = block.trim();
      if (!block) return "";
      if (block.startsWith("<ul>") || block.startsWith("<ol>")) return block;
      return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
    }).join("");

    return html;
  }

  // ------------------------------------------------------------------
  // DOM Rendering
  // ------------------------------------------------------------------
  function render() {
    renderSidebar();
    renderMain();
  }

  // ---- Sidebar ----
  function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("hidden", !sidebarOpen);

    // Toggle button visibility
    document.getElementById("btn-open-sidebar").style.display = sidebarOpen ? "none" : "";

    // Conversation list
    const listEl = document.getElementById("conv-list-items");
    listEl.innerHTML = "";

    if (conversations.length === 0) {
      listEl.innerHTML = `<div class="conv-list-empty">No conversations yet.</div>`;
    } else {
      conversations.forEach((conv) => {
        const div = document.createElement("div");
        div.className = "conv-item" + (conv.id === activeId ? " active" : "");
        div.innerHTML = `
          <button class="conv-item-btn" data-id="${conv.id}">
            ${ICONS.messageSquare}
            <span class="conv-item-title">${escapeHtml(conv.title)}</span>
          </button>
          <button class="conv-item-del" data-id="${conv.id}" title="Delete conversation">
            ${ICONS.trash}
          </button>
        `;
        listEl.appendChild(div);
      });
    }

    // Settings controls
    renderSettings();
  }

  function renderSettings() {
    // Toggle
    const track = document.getElementById("toggle-confidence");
    track.classList.toggle("on", settings.showConfidence);

    // Slider
    const sliderInput = document.getElementById("slider-threshold");
    const sliderValue = document.getElementById("slider-value");
    const sliderFill = document.getElementById("slider-fill");
    const sliderDot = document.getElementById("slider-dot");

    sliderInput.value = settings.confidenceThreshold;
    sliderValue.textContent = settings.confidenceThreshold + "%";
    sliderFill.style.width = settings.confidenceThreshold + "%";
    sliderDot.style.left = settings.confidenceThreshold + "%";
  }

  // ---- Main Chat Area ----
  function renderMain() {
    const container = document.getElementById("messages-container");
    const conv = getActive();
    const messages = conv ? conv.messages : [];

    container.innerHTML = "";

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${ICONS.stethoscope}</div>
          <h2>How can I help you today?</h2>
          <p>I am MedExpert, specialized in providing evidence-based information regarding Pressure Ulcers for medical practitioners.</p>
        </div>
      `;
    } else {
      messages.forEach((msg) => {
        container.appendChild(createMessageEl(msg));
      });

      if (isLoading) {
        container.appendChild(createLoadingEl());
      }
    }

    // Scroll to bottom
    requestAnimationFrame(() => {
      const scroll = document.getElementById("messages-scroll");
      scroll.scrollTop = scroll.scrollHeight;
    });
  }

  function createMessageEl(msg) {
    const isModel = msg.role === "model";
    const isInsufficient =
      isModel &&
      msg.confidence !== undefined &&
      msg.confidence < settings.confidenceThreshold;

    const div = document.createElement("div");
    div.className = "message " + msg.role;

    // Avatar
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "avatar " + (isModel ? "ai" : "human");
    avatarDiv.textContent = isModel ? "AI" : "ME";
    div.appendChild(avatarDiv);

    // Body
    const bodyDiv = document.createElement("div");
    bodyDiv.className = "message-body";

    if (isModel) {
      const textDiv = document.createElement("div");
      textDiv.className = "message-text" + (isInsufficient ? " insufficient" : "");
      textDiv.innerHTML = isInsufficient
        ? "I don't have enough information to answer the question."
        : renderMarkdown(msg.content);
      bodyDiv.appendChild(textDiv);

      // Confidence badge
      if (settings.showConfidence && msg.confidence !== undefined) {
        const badge = document.createElement("span");
        let level = "high";
        if (isInsufficient) level = "low";
        else if (msg.confidence < settings.confidenceThreshold) level = "low";
        else if (msg.confidence < 90) level = "medium";

        badge.className = "confidence-badge " + level;
        badge.textContent = "Confidence: " + msg.confidence + "%";
        bodyDiv.appendChild(badge);
      }
    } else {
      bodyDiv.textContent = msg.content;
    }

    div.appendChild(bodyDiv);
    return div;
  }

  function createLoadingEl() {
    const div = document.createElement("div");
    div.className = "loading-dots";
    div.innerHTML = `
      <div class="avatar ai">AI</div>
      <div class="dots-container">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    return div;
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  function createConversation() {
    const newConv = {
      id: uuid(),
      title: "New Conversation",
      messages: [],
      updatedAt: Date.now(),
    };
    conversations.unshift(newConv);
    activeId = newConv.id;
    saveConversations();
    render();
  }

  function deleteConversation(id) {
    conversations = conversations.filter((c) => c.id !== id);
    if (activeId === id) {
      activeId = conversations.length > 0 ? conversations[0].id : null;
    }
    saveConversations();
    render();
  }

  function selectConversation(id) {
    activeId = id;
    render();
    // On mobile, close sidebar after selecting
    if (window.innerWidth <= 768) {
      sidebarOpen = false;
      render();
    }
  }

  function updateConversation(id, messages, title) {
    conversations = conversations.map((c) => {
      if (c.id !== id) return c;
      return {
        ...c,
        messages,
        title: title ||
          (messages.length > 0 && c.title === "New Conversation"
            ? messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? "..." : "")
            : c.title),
        updatedAt: Date.now(),
      };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
    saveConversations();
  }

  // ------------------------------------------------------------------
  // Send Message
  // ------------------------------------------------------------------
  async function handleSend() {
    const textarea = document.getElementById("chat-input");
    const content = textarea.value.trim();
    if (!content || isLoading) return;

    textarea.value = "";
    textarea.style.height = "auto";

    // Build or get the active conversation
    let conv = getActive();
    if (!conv) {
      const newConv = {
        id: uuid(),
        title: "New Conversation",
        messages: [],
        updatedAt: Date.now(),
      };
      conversations.unshift(newConv);
      activeId = newConv.id;
      conv = newConv;
    }

    // Add user message
    const userMsg = { id: uuid(), role: "user", content };
    conv.messages.push(userMsg);
    const newTitle = conv.messages.length === 1
      ? content.slice(0, 30) + (content.length > 30 ? "..." : "")
      : undefined;
    updateConversation(conv.id, conv.messages, newTitle);

    isLoading = true;
    render();

    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: content,
          confidence_threshold: settings.confidenceThreshold,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Server error");
      }

      const modelMsg = {
        id: uuid(),
        role: "model",
        content: data.answer || "Sorry, I couldn't process the response.",
        confidence: data.confidence,
      };

      conv.messages.push(modelMsg);
      updateConversation(conv.id, conv.messages);
    } catch (err) {
      console.error("Failed to get response:", err);
      const errMsg = {
        id: uuid(),
        role: "model",
        content: "An error occurred while communicating with the AI. " + (err.message || "Please try again."),
      };
      conv.messages.push(errMsg);
      updateConversation(conv.id, conv.messages);
    } finally {
      isLoading = false;
      render();
    }
  }

  // ------------------------------------------------------------------
  // Event Binding
  // ------------------------------------------------------------------
  function bindEvents() {
    // New conversation
    document.getElementById("btn-new-conv").addEventListener("click", createConversation);

    // Conversation list (delegated)
    document.getElementById("conv-list-items").addEventListener("click", (e) => {
      const selectBtn = e.target.closest(".conv-item-btn");
      const delBtn = e.target.closest(".conv-item-del");
      if (delBtn) {
        e.stopPropagation();
        deleteConversation(delBtn.dataset.id);
      } else if (selectBtn) {
        selectConversation(selectBtn.dataset.id);
      }
    });

    // Sidebar toggle
    document.getElementById("btn-open-sidebar").addEventListener("click", () => {
      sidebarOpen = true;
      render();
    });

    const btnCloseSidebar = document.getElementById("btn-close-sidebar");
    if (btnCloseSidebar) {
      btnCloseSidebar.addEventListener("click", () => {
        sidebarOpen = false;
        render();
      });
    }

    // Handle resize
    window.addEventListener("resize", () => {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile && !sidebarOpen) {
        sidebarOpen = true;
        render();
      } else if (isMobile && sidebarOpen && document.activeElement !== document.getElementById("chat-input")) {
        // optionally hide if resized to mobile, but we can just leave it
      }
    });

    // Confidence toggle
    document.getElementById("toggle-confidence").addEventListener("click", () => {
      settings.showConfidence = !settings.showConfidence;
      saveSettings();
      render();
    });

    // Threshold slider
    document.getElementById("slider-threshold").addEventListener("input", (e) => {
      settings.confidenceThreshold = parseInt(e.target.value, 10);
      saveSettings();
      renderSettings();
      // Re-render messages to reflect new threshold
      renderMain();
    });

    // Send button
    document.getElementById("btn-send").addEventListener("click", handleSend);

    // Textarea: auto-resize + Enter to send
    const textarea = document.getElementById("chat-input");
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
      updateSendButton();
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  function updateSendButton() {
    const textarea = document.getElementById("chat-input");
    const btn = document.getElementById("btn-send");
    const hasText = textarea.value.trim().length > 0;
    btn.className = "btn-send " + (hasText && !isLoading ? "active" : "disabled");
    btn.innerHTML = isLoading ? ICONS.loader : ICONS.send;
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    render();
    updateSendButton();
  });
})();
