const params = new URLSearchParams(window.location.search);
const SETTINGS_KEY = "trinethra_settings";
const ARCHIVE_KEY = "trinethra_archive";
const DEFAULT_API_BASE = "http://localhost:8001";
const MIN_TRANSCRIPT_CHARS = 50;
const MAX_TRANSCRIPT_CHARS = 10000;

function safeJsonParse(raw, fallback, label) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(label);
    return fallback;
  }
}

function loadSettings() {
  const defaults = { apiUrl: DEFAULT_API_BASE, fastMode: false };
  const stored = safeJsonParse(localStorage.getItem(SETTINGS_KEY), {}, SETTINGS_KEY);
  return { ...defaults, ...stored };
}

function saveSettings(updates) {
  const merged = { ...loadSettings(), ...updates };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

function loadArchive() {
  const archive = safeJsonParse(localStorage.getItem(ARCHIVE_KEY), [], ARCHIVE_KEY);
  return Array.isArray(archive) ? archive : [];
}

function saveArchive(archive) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.slice(0, 50)));
}

function getInitialApiBase() {
  return params.get("api") || loadSettings().apiUrl || DEFAULT_API_BASE;
}

let API_BASE = getInitialApiBase();
let currentView = "workspace";
let currentResult = null;
let lastModelName = "Unknown";

const samples = {
  karthik: {
    fellowName: "Karthik",
    companyName: "Veerabhadra Auto",
    transcript: `Intern: How has Karthik been performing over the last month?\n\nSupervisor: Overall he is very reliable. If I give him a task, I can forget about it. Earlier I had to chase production and dispatch separately, now Karthik follows up with both teams every morning.\n\nIntern: Has he created any process or system that others use?\n\nSupervisor: He maintains one production sheet in Excel and sends me the status by evening. But honestly he is the one updating it. If he is absent, I don't think the operators will update it themselves. He has not pushed them much on that.\n\nIntern: Any measurable improvement?\n\nSupervisor: Dispatch delays have reduced. Earlier we missed two or three dispatch dates in a week, now usually it is one or none because he reminds people before lunch. Quality is about the same.\n\nIntern: How does the floor team respond to him?\n\nSupervisor: They like him because he does not argue. Sometimes I wish he would push back more when the production team gives excuses. He is polite and dependable, but he waits for my direction on bigger issues.`,
  },
  meena: {
    fellowName: "Meena",
    companyName: "Lakshmi Textiles",
    transcript: `Intern: What is your feedback on Meena's work?\n\nSupervisor: At first I was worried because she sits with her laptop a lot. Our people are usually on the floor, so I felt she was not visible enough. But later I understood she was tracking dispatch risk.\n\nIntern: Can you give an example?\n\nSupervisor: She noticed that whenever dyeing approval comes after 4 PM, the next day shipment is at risk. Nobody had connected that pattern. She made a simple dashboard with red flags and now the dispatch clerk and dyeing supervisor both check it at 3 PM.\n\nIntern: Did it affect business outcomes?\n\nSupervisor: Yes, last month one export shipment would have been delayed, but her alert helped us move approval earlier. Our late dispatches have come down from around five in a month to two.\n\nIntern: How has she handled the team?\n\nSupervisor: The older dyeing supervisor resisted at first and said this is extra work. Meena sat with him for two days, simplified the entry format, and now he updates it himself. I still feel she should spend more time on the floor, but the system is useful.`,
  },
  anil: {
    fellowName: "Anil",
    companyName: "Prabhat Foods",
    transcript: `Intern: How is Anil doing at Prabhat Foods?\n\nSupervisor: Excellent. I don't know how we managed before him. He is my right hand now. He handles all my calls with distributors, follows up with purchase, checks invoices, and even talks to transporters when trucks are late.\n\nIntern: Has he built any process that the team uses without him?\n\nSupervisor: Process means he knows what to do. If something is stuck, I call Anil and he fixes it. Last week he came at 3 AM when one vehicle was held at the gate. Very dedicated boy.\n\nIntern: What happens if he is away for two days?\n\nSupervisor: Then I will be in trouble. The purchase team and transporter both call him directly now. He has all details in his head and phone. We have not documented it yet.\n\nIntern: Any metrics that improved?\n\nSupervisor: I get fewer escalations because Anil takes everything off my plate. Customers are happier because he personally calls them. But if you ask for a tracker or SOP, not yet.`,
  },
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  checkHealth();
  bindEvents();
  renderKpiReference();
  switchView("workspace");

  document.querySelector("header")?.classList.add("animate-fade-in-top");
  const sections = document.querySelectorAll("main section");
  if (sections[0]) sections[0].classList.add("animate-slide-in-left");
  if (sections[1]) sections[1].classList.add("animate-slide-in-right");
});

function cacheElements() {
  Object.assign(els, {
    healthPill: document.getElementById("healthPill"),
    healthText: document.getElementById("healthText"),
    fellowName: document.getElementById("fellowName"),
    companyName: document.getElementById("companyName"),
    transcript: document.getElementById("transcript"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    statusMessage: document.getElementById("statusMessage"),
    emptyState: document.getElementById("emptyState"),
    results: document.getElementById("results"),
    scoreCard: document.getElementById("scoreCard"),
    evidenceList: document.getElementById("evidenceList"),
    kpiList: document.getElementById("kpiList"),
    gapList: document.getElementById("gapList"),
    questionList: document.getElementById("questionList"),
    evidenceCount: document.getElementById("evidenceCount"),
    kpiCount: document.getElementById("kpiCount"),
    gapCount: document.getElementById("gapCount"),
    questionCount: document.getElementById("questionCount"),
  });
}

function bindEvents() {
  document.querySelectorAll("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.remove("animate-ripple");
      button.offsetWidth;
      button.classList.add("animate-ripple");
      loadSample(button.dataset.sample);
    });
  });

  els.analyzeBtn.addEventListener("click", runAnalysis);

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("saveBtn").addEventListener("click", saveAssessment);
  document.getElementById("exportBtn").addEventListener("click", exportAssessment);

  document.getElementById("saveApiUrlBtn").addEventListener("click", () => {
    const newUrl = document.getElementById("settingApiUrl").value.trim();
    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
      alert("Invalid URL. Must start with http:// or https://");
      return;
    }
    saveSettings({ apiUrl: newUrl });
    API_BASE = newUrl;
    document.getElementById("currentApiUrl").textContent = newUrl;
    setStatus(`API URL updated to ${newUrl}. Rechecking health now.`, false);
    checkHealth();
  });

  document.getElementById("settingFastMode").addEventListener("change", (event) => {
    saveSettings({ fastMode: event.target.checked });
    setStatus(`Fast mode ${event.target.checked ? "enabled" : "disabled"}.`, false);
  });

  document.getElementById("clearAllDataBtn").addEventListener("click", () => {
    if (!confirm("This will permanently delete all saved assessments. Continue?")) return;
    localStorage.removeItem(ARCHIVE_KEY);
    if (currentView === "archive") renderArchive();
    setStatus("All saved assessments cleared.", false);
  });

  document.getElementById("clearArchiveBtn").addEventListener("click", clearArchive);
}

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    lastModelName = data.model || "Unknown";

    if (data.status === "ok") {
      setHealthState("ok", `Ollama OK - ${lastModelName}`);
    } else {
      setHealthState("error", data.message || `Ollama issue - ${lastModelName}`);
    }
  } catch (error) {
    lastModelName = "Unknown";
    setHealthState("error", `Backend not reachable - ${error.message}`);
  }

  const modelEl = document.getElementById("settingModelName");
  if (modelEl) modelEl.textContent = lastModelName;
}

function setHealthState(state, text) {
  const icon = els.healthPill.querySelector(".material-symbols-outlined");
  if (state === "ok") {
    els.healthPill.classList.remove("border-error", "animate-health-error");
    els.healthPill.classList.add("border-black", "animate-health-success");
    icon.classList.add("text-orange-600");
    icon.classList.remove("text-error");
  } else {
    els.healthPill.classList.add("border-error", "animate-health-error");
    els.healthPill.classList.remove("border-black", "animate-health-success");
    icon.classList.remove("text-orange-600");
    icon.classList.add("text-error");
  }
  els.healthText.textContent = text;
}

function loadSample(key) {
  const sample = samples[key];
  if (!sample) {
    setStatus(`Sample "${key}" was not found.`, true);
    return;
  }
  els.fellowName.value = sample.fellowName;
  els.companyName.value = sample.companyName;
  els.transcript.value = sample.transcript;
  setStatus(`Loaded ${sample.fellowName} sample.`, false);
}

async function runAnalysis() {
  const transcript = els.transcript.value.trim();
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    setStatus("Transcript is too short. Paste at least 50 characters.", true);
    return;
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    setStatus("Transcript is too long. Keep it under 10,000 characters.", true);
    return;
  }

  setLoading(true);
  setStatus("Sending to Ollama... this may take 20-40 seconds.", false);

  try {
    const settings = loadSettings();
    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        fellow_name: els.fellowName.value.trim(),
        company_name: els.companyName.value.trim(),
        fast_mode: Boolean(settings.fastMode),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed with status ${response.status}`);
    }

    const result = await response.json();
    renderResults(result);
    setStatus("Analysis ready. Review before finalizing.", false);
  } catch (error) {
    setStatus(error.message || "Analysis failed.", true);
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  els.analyzeBtn.disabled = isLoading;
  if (isLoading) {
    els.analyzeBtn.classList.add("animate-pulse-border");
    els.analyzeBtn.innerHTML = '<span class="material-symbols-outlined text-3xl animate-spin-custom" data-icon="progress_activity">progress_activity</span> Analyzing...';
  } else {
    els.analyzeBtn.classList.remove("animate-pulse-border");
    els.analyzeBtn.innerHTML = '<span class="material-symbols-outlined text-3xl" data-icon="bolt">bolt</span> Run Analysis';
  }
}

function setStatus(message, isError) {
  const newClass = isError
    ? "mt-4 font-label-mono text-sm text-error uppercase text-center"
    : "mt-4 font-label-mono text-sm text-black uppercase text-center";

  els.statusMessage.textContent = message;
  els.statusMessage.className = newClass;
  els.statusMessage.classList.remove("animate-fade-out");
  els.statusMessage.classList.add("animate-fade-in");
}

function isValidResult(result) {
  return Boolean(
    result &&
      result.score &&
      Array.isArray(result.evidence) &&
      Array.isArray(result.kpi_mapping) &&
      Array.isArray(result.gaps) &&
      Array.isArray(result.follow_up_questions)
  );
}

function renderResults(result) {
  if (!isValidResult(result)) {
    setStatus("Malformed analysis result. The backend response did not match the expected schema.", true);
    return;
  }

  currentResult = structuredCloneSafe(result);
  els.emptyState.style.display = "none";
  els.results.style.display = "grid";

  renderScore(currentResult.score);
  renderEvidence(currentResult.evidence);
  renderKpis(currentResult.kpi_mapping);
  renderGaps(currentResult.gaps);
  renderQuestions(currentResult.follow_up_questions);

  const sectionsToAnimate = [
    { el: els.scoreCard, cls: "animate-pop-spring" },
    { el: els.evidenceList.parentElement, cls: "animate-in" },
    { el: els.kpiList.parentElement, cls: "animate-in" },
    { el: els.gapList.parentElement, cls: "animate-in" },
    { el: els.questionList.parentElement, cls: "animate-in" },
  ];

  sectionsToAnimate.forEach((item, index) => {
    item.el.classList.remove(item.cls);
    item.el.style.opacity = "0";
    setTimeout(() => {
      item.el.classList.add(item.cls);
    }, index * 80);
  });
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function bandColorClass(band) {
  if (band === "Need Attention") return "bg-error text-white";
  if (band === "Productivity") return "bg-amber-500 text-black";
  return "bg-green-600 text-white";
}

function renderScore(score) {
  const override = currentResult?.override;
  const overrideNote = override
    ? `<div class="mt-3 text-xs font-label-mono text-orange-600 uppercase">Override saved: original ${escapeHtml(override.original_score)}/10 -> ${escapeHtml(override.overridden_score)}/10. Reason: ${escapeHtml(override.reason)}</div>`
    : "";

  els.scoreCard.innerHTML = `
    <div class="col-span-12 md:col-span-4 border-4 border-black bg-white p-6 brutalist-shadow flex flex-col justify-center items-center text-center">
      <div class="mb-4 bg-black text-white px-3 py-2 font-label-mono text-caption uppercase flex items-center gap-2">
        <span class="material-symbols-outlined text-orange-600" data-icon="warning" data-weight="fill">warning</span>
        AI DRAFT: SUBJECT TO REVIEW
      </div>
      <div class="font-label-mono text-caption uppercase mb-2">Final Score</div>
      <div id="scoreValueDisplay" class="text-headline-xl font-headline-xl text-black">${escapeHtml(score.value)}/10</div>
      <div class="mt-2 font-label-mono uppercase text-caption text-on-surface">${escapeHtml(score.label)}</div>
      <div class="mt-4 px-3 py-1 border-2 border-black ${bandColorClass(score.band)} font-label-mono uppercase text-caption">${escapeHtml(score.band)}</div>
      <button type="button" class="mt-4 text-xs font-label-mono underline uppercase hover:text-orange-600" id="editScoreBtn">Edit Score</button>
      ${overrideNote}
    </div>
    <div class="col-span-12 md:col-span-8 border-4 border-black bg-white p-6 brutalist-shadow relative">
      <div class="font-label-mono text-caption uppercase border-b-2 border-black mb-4 pb-1">Justification Summary</div>
      <p class="font-body-md text-on-surface">${escapeHtml(score.justification)}</p>
      <p class="text-xs text-on-surface-variant mt-4 font-label-mono uppercase">Confidence: ${escapeHtml(score.confidence)} - ${escapeHtml(score.confidence_reason)}</p>

      <form class="mt-4 border-t-2 border-black pt-4" id="overrideForm" style="display: none;">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <label class="space-y-1">
            <span class="font-label-mono text-caption uppercase flex mb-1">New score</span>
            <input id="overrideScore" class="w-full border-2 border-black p-2 font-body-md" type="number" min="1" max="10" value="${escapeHtml(score.value)}" />
          </label>
          <label class="space-y-1">
            <span class="font-label-mono text-caption uppercase flex mb-1">Reason</span>
            <input id="overrideReason" class="w-full border-2 border-black p-2 font-body-md" placeholder="Why change?" type="text" />
          </label>
        </div>
        <button id="saveOverrideBtn" type="submit" class="bg-black text-white px-4 py-2 font-label-mono uppercase brutalist-shadow-hover text-sm">Save Override</button>
        <div id="overrideNote" class="text-xs mt-2 text-error font-label-mono"></div>
      </form>
    </div>
  `;

  document.getElementById("editScoreBtn").addEventListener("click", () => {
    document.getElementById("overrideForm").style.display = "block";
  });

  document.getElementById("overrideForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const newScore = Number(document.getElementById("overrideScore").value);
    const reason = document.getElementById("overrideReason").value.trim();
    const note = document.getElementById("overrideNote");

    if (!Number.isInteger(newScore) || newScore < 1 || newScore > 10) {
      note.textContent = "Enter a score from 1 to 10.";
      return;
    }
    if (!reason) {
      note.textContent = "A reason is required before saving an override.";
      return;
    }

    const originalScore = currentResult.override?.original_score ?? currentResult.score.value;
    currentResult.override = {
      original_score: originalScore,
      overridden_score: newScore,
      reason,
      timestamp: new Date().toISOString(),
    };
    currentResult.score.value = newScore;
    renderScore(currentResult.score);
    setStatus(`Override saved locally: score ${newScore}.`, false);
  });
}

function renderEvidence(evidence) {
  els.evidenceCount.textContent = `${evidence.length} quotes`;
  if (!evidence.length) {
    els.evidenceList.innerHTML = emptyList("No evidence returned.");
    return;
  }

  els.evidenceList.innerHTML = evidence.map((item) => {
    const signal = item.signal?.toLowerCase();
    const signalStyles = {
      positive: { bgClass: "bg-green-50", iconBg: "bg-green-600", signalColor: "text-green-700" },
      negative: { bgClass: "bg-red-50", iconBg: "bg-error", signalColor: "text-error" },
      neutral: { bgClass: "bg-zinc-100", iconBg: "bg-zinc-700", signalColor: "text-zinc-700" },
    };
    const { bgClass, iconBg, signalColor } = signalStyles[signal] || signalStyles.neutral;

    return `
      <div class="border-2 border-black p-4 ${bgClass} relative mt-2">
        <span class="material-symbols-outlined absolute -top-3 -left-3 ${iconBg} text-white p-1 border-2 border-black text-sm" data-icon="format_quote">format_quote</span>
        <p class="italic text-sm">"${escapeHtml(item.quote)}"</p>
        <div class="mt-2 text-[10px] font-label-mono uppercase ${signalColor}">Signal: ${escapeHtml(item.signal)} | ${formatDimension(item.dimension)}</div>
        <p class="text-sm mt-2">${escapeHtml(item.interpretation)}</p>
      </div>
    `;
  }).join("");

  cascadeChildren(els.evidenceList);
}

function renderKpis(kpis) {
  els.kpiCount.textContent = `${kpis.length} mapped`;
  if (!kpis.length) {
    els.kpiList.innerHTML = emptyList("No KPI connection found");
    return;
  }

  els.kpiList.innerHTML = kpis.map((item) => {
    const isSystem = item.system_or_personal === "system";
    const typeLabel = isSystem ? "System" : "Personal";
    const typeClass = isSystem ? "bg-green-600 text-white" : "bg-amber-500 text-black";

    return `
      <div class="border-4 border-black p-4 bg-white -mb-1 -mr-1">
        <div class="flex flex-col justify-between mb-2">
          <div class="font-label-mono text-caption font-bold uppercase">${escapeHtml(item.kpi)}</div>
          <div class="mt-2 w-fit px-2 py-1 border-2 border-black text-[10px] uppercase font-label-mono ${typeClass}">${typeLabel}</div>
        </div>
        <div class="h-2 w-full bg-zinc-200 border border-black mb-2">
          <div class="h-full bg-orange-600 w-full"></div>
        </div>
        <p class="text-[10px] italic mb-1 text-zinc-800">"${escapeHtml(item.evidence)}"</p>
        <p class="text-[10px] text-zinc-600">${escapeHtml(item.note)}</p>
      </div>
    `;
  }).join("");

  cascadeChildren(els.kpiList);
}

function renderGaps(gaps) {
  els.gapCount.textContent = `${gaps.length} gaps`;
  if (!gaps.length) {
    els.gapList.innerHTML = emptyList("All four dimensions have some evidence.");
    return;
  }

  els.gapList.innerHTML = gaps.map((item) => `
    <li class="flex items-start gap-2">
      <span class="material-symbols-outlined text-error" data-icon="close">close</span>
      <div>
        <div class="text-[10px] font-label-mono uppercase text-error">${formatDimension(item.dimension)}</div>
        <span class="text-sm">${escapeHtml(item.detail)}</span>
      </div>
    </li>
  `).join("");

  cascadeChildren(els.gapList);
}

function renderQuestions(questions) {
  els.questionCount.textContent = `${questions.length} questions`;
  if (!questions.length) {
    els.questionList.innerHTML = emptyList("No follow-up questions returned.");
    return;
  }

  els.questionList.innerHTML = questions.map((item, index) => `
    <li class="flex items-start gap-2">
      <span class="material-symbols-outlined text-orange-600" data-icon="question_mark">question_mark</span>
      <div>
        <div class="text-[10px] font-label-mono uppercase text-orange-600">Q${index + 1} | ${formatDimension(item.target_gap)}</div>
        <span class="text-sm font-bold">${escapeHtml(item.question)}</span>
        <p class="text-xs mt-1">${escapeHtml(item.looking_for)}</p>
      </div>
    </li>
  `).join("");

  cascadeChildren(els.questionList);
}

function cascadeChildren(container) {
  Array.from(container.children).forEach((child, idx) => {
    child.classList.add("animate-list-item");
    child.style.animationDelay = `${idx * 60}ms`;
  });
}

function formatDimension(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function emptyList(text) {
  return `<div class="col-span-full p-4 border-2 border-black bg-zinc-100 text-sm font-label-mono uppercase text-center">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function switchView(viewName) {
  const view = document.getElementById(`view-${viewName}`);
  if (!view) {
    setStatus(`View "${viewName}" was not found.`, true);
    return;
  }
  document.querySelectorAll('[id^="view-"]').forEach((v) => {
    v.style.display = "none";
  });
  view.style.display = "block";
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active-nav", btn.dataset.view === viewName);
  });
  currentView = viewName;

  if (viewName === "archive") renderArchive();
  if (viewName === "settings") initSettingsView();
}

function saveAssessment() {
  if (!currentResult) {
    setStatus("No analysis to save. Run an analysis first.", true);
    return;
  }

  const analysis = structuredCloneSafe(currentResult);
  const entry = {
    id: Date.now(),
    savedAt: new Date().toISOString(),
    fellowName: els.fellowName.value.trim() || "Unknown Fellow",
    companyName: els.companyName.value.trim() || "Unknown Company",
    transcript: els.transcript.value.trim(),
    analysis,
    ...analysis,
  };

  const archive = loadArchive();
  archive.unshift(entry);
  saveArchive(archive);

  setStatus(`Saved assessment for ${entry.fellowName}.`, false);
  if (currentView === "archive") renderArchive();
}

function renderArchive() {
  const archive = loadArchive();
  const container = document.getElementById("archiveList");

  if (archive.length === 0) {
    container.innerHTML = `<div class="text-center py-12 font-label-mono text-sm text-gray-400 uppercase">
      No saved assessments yet. Run an analysis and click Save Assessment.
    </div>`;
    return;
  }

  container.innerHTML = archive.map((entry) => {
    const result = entry.analysis || entry;
    const date = new Date(entry.savedAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const score = result.score || {};
    const override = result.override;
    const scoreValue = override?.overridden_score ?? score.value ?? "?";
    const bandColor = score.band === "Performance"
      ? "bg-green-600"
      : score.band === "Need Attention"
        ? "bg-red-600"
        : "bg-black";

    return `<div class="border border-black brutalist-shadow p-4 bg-white">
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="font-bold text-sm uppercase tracking-wide">${escapeHtml(entry.fellowName)}</div>
          <div class="text-xs font-label-mono text-gray-500">${escapeHtml(entry.companyName)} - ${date}</div>
          ${override ? `<div class="text-[10px] font-label-mono text-orange-600 uppercase mt-1">Override: ${escapeHtml(override.original_score)} -> ${escapeHtml(override.overridden_score)}</div>` : ""}
        </div>
        <div class="flex items-center gap-2">
          <span class="${bandColor} text-white text-xs font-bold px-2 py-1 uppercase">
            ${escapeHtml(scoreValue)} - ${escapeHtml(score.band ?? "")}
          </span>
          <button id="loadArchiveBtn-${entry.id}" data-archive-load="${entry.id}" class="border border-black px-3 py-1 text-xs font-label-mono uppercase bg-white brutalist-shadow-hover">Load</button>
          <button id="deleteArchiveBtn-${entry.id}" data-archive-delete="${entry.id}" class="border border-red-600 text-red-600 px-3 py-1 text-xs font-label-mono uppercase bg-white hover:bg-red-600 hover:text-white">Delete</button>
        </div>
      </div>
    </div>`;
  }).join("");

  container.querySelectorAll("[data-archive-load]").forEach((button) => {
    button.addEventListener("click", () => loadFromArchive(Number(button.dataset.archiveLoad)));
  });
  container.querySelectorAll("[data-archive-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteFromArchive(Number(button.dataset.archiveDelete)));
  });
}

function loadFromArchive(id) {
  const archive = loadArchive();
  const entry = archive.find((candidate) => candidate.id === id);
  if (!entry) {
    setStatus("Archived assessment was not found.", true);
    return;
  }

  const result = entry.analysis || entry;
  els.fellowName.value = entry.fellowName || "";
  els.companyName.value = entry.companyName || "";
  els.transcript.value = entry.transcript || "";

  renderResults(result);
  switchView("workspace");
  setStatus(`Loaded archived assessment for ${entry.fellowName}.`, false);
}

function deleteFromArchive(id) {
  const archive = loadArchive().filter((entry) => entry.id !== id);
  saveArchive(archive);
  renderArchive();
}

function clearArchive() {
  if (!confirm("Delete all saved assessments? This cannot be undone.")) return;
  localStorage.removeItem(ARCHIVE_KEY);
  renderArchive();
}

const KPI_REFERENCE = [
  { id: "lead_generation", label: "Lead Generation", color: "bg-blue-600", description: "Finding new clients, schools, or partners.", example: '"She finds new schools to partner with"' },
  { id: "lead_conversion", label: "Lead Conversion", color: "bg-indigo-600", description: "Converting leads into paying clients.", example: '"He closed 3 new accounts this month"' },
  { id: "upselling", label: "Upselling", color: "bg-purple-600", description: "Getting existing clients to order more.", example: '"Existing clients are ordering bigger quantities"' },
  { id: "cross_selling", label: "Cross-selling", color: "bg-pink-600", description: "Expanding product/service range to existing clients.", example: '"We started supplying packaging too"' },
  { id: "nps", label: "NPS / Customer Satisfaction", color: "bg-green-600", description: "Improving customer happiness and reducing complaints.", example: '"Retailers are much happier now, fewer complaints"' },
  { id: "pat", label: "PAT / Profitability", color: "bg-yellow-600", description: "Reducing waste or costs, improving margins.", example: '"We reduced waste, costs came down"' },
  { id: "tat", label: "TAT / Turnaround Time", color: "bg-orange-600", description: "Speeding up delivery or internal processes.", example: '"Dispatch is faster, we don\'t miss deadlines"' },
  { id: "quality", label: "Quality", color: "bg-red-600", description: "Reducing defects, rejections, or rework.", example: '"Rejection rate dropped, fewer customer complaints"' },
];

function renderKpiReference() {
  const container = document.getElementById("kpiReferenceTable");
  container.innerHTML = KPI_REFERENCE.map((kpi) => `
    <div class="border border-black brutalist-shadow p-4 flex items-start gap-4 bg-white">
      <span class="${kpi.color} text-white text-xs font-bold px-2 py-1 uppercase font-label-mono min-w-fit">${escapeHtml(kpi.id)}</span>
      <div>
        <div class="font-bold text-sm uppercase tracking-wide">${escapeHtml(kpi.label)}</div>
        <div class="text-xs text-gray-600 mt-1">${escapeHtml(kpi.description)}</div>
        <div class="text-xs font-label-mono text-gray-400 mt-1 italic">e.g. ${escapeHtml(kpi.example)}</div>
      </div>
    </div>
  `).join("");
}

function initSettingsView() {
  const settings = loadSettings();
  document.getElementById("settingApiUrl").value = API_BASE;
  document.getElementById("currentApiUrl").textContent = API_BASE;
  document.getElementById("settingFastMode").checked = Boolean(settings.fastMode);
  document.getElementById("settingModelName").textContent = lastModelName || els.healthText.textContent || "Unknown";
}

function exportAssessment() {
  if (!currentResult) {
    setStatus("No analysis to export. Run an analysis first.", true);
    return;
  }

  const fellowName = els.fellowName.value.trim() || "Unknown";
  const companyName = els.companyName.value.trim() || "Unknown";
  const now = new Date().toLocaleString("en-IN");
  const score = currentResult.score || {};

  let text = "";
  text += "TRINETHRA ASSESSMENT DRAFT\n";
  text += `Generated: ${now}\n`;
  text += `Fellow: ${fellowName} | Company: ${companyName}\n`;
  text += `${"=".repeat(60)}\n\n`;

  text += `PERFORMANCE SCORE\n${"-".repeat(40)}\n`;
  text += `Score: ${score.value}/10 - ${score.label} (${score.band})\n`;
  text += `Justification: ${score.justification}\n`;
  text += `Confidence: ${score.confidence} - ${score.confidence_reason}\n`;
  if (currentResult.override) {
    text += `Override: ${currentResult.override.original_score}/10 -> ${currentResult.override.overridden_score}/10\n`;
    text += `Override Reason: ${currentResult.override.reason}\n`;
    text += `Override Timestamp: ${currentResult.override.timestamp}\n`;
  }
  text += "\n";

  text += `VERIFIED EVIDENCE\n${"-".repeat(40)}\n`;
  currentResult.evidence.forEach((e, i) => {
    text += `${i + 1}. [${String(e.signal).toUpperCase()} | ${e.dimension}]\n`;
    text += `   Quote: "${e.quote}"\n`;
    text += `   Interpretation: ${e.interpretation}\n\n`;
  });

  text += `KPI MAPPING\n${"-".repeat(40)}\n`;
  if (!currentResult.kpi_mapping.length) {
    text += "No KPI connection found.\n\n";
  }
  currentResult.kpi_mapping.forEach((k, i) => {
    text += `${i + 1}. ${k.kpi} [${String(k.system_or_personal).toUpperCase()}]\n`;
    text += `   Evidence: ${k.evidence}\n`;
    text += `   Note: ${k.note}\n\n`;
  });

  text += `IDENTIFIED GAPS\n${"-".repeat(40)}\n`;
  currentResult.gaps.forEach((g, i) => {
    text += `${i + 1}. ${g.dimension}: ${g.detail}\n\n`;
  });

  text += `FOLLOW-UP QUESTIONS\n${"-".repeat(40)}\n`;
  currentResult.follow_up_questions.forEach((q, i) => {
    text += `${i + 1}. ${q.question}\n`;
    text += `   Target Gap: ${q.target_gap}\n`;
    text += `   Looking For: ${q.looking_for}\n\n`;
  });

  text += `${"=".repeat(60)}\n`;
  text += "AI DRAFT - SUBJECT TO INTERN REVIEW AND OVERRIDE\n";

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trinethra_${fellowName.replace(/\s+/g, "_")}_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus(`Exported assessment for ${fellowName}.`, false);
}
