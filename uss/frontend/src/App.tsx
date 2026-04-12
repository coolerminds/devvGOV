import { Fragment, type CSSProperties, startTransition, useDeferredValue, useEffect, useState } from "react";

type AgencySummary = {
  slug: string;
  name: string;
  wordCount: number;
  checksum: string;
  topicCount: number;
  latestAmendedOn: string | null;
};

type AgencyTopic = {
  id: number;
  title: number;
  chapter?: string | null;
  subtitle?: string | null;
  subchapter?: string | null;
  part?: string | null;
  wordCount: number;
  checksum: string;
  viewCount: number;
  previewText: string;
};

type AgencyHistoryMonth = {
  month: string;
  amendmentCount: number;
  removalCount: number;
};

type AgencyDetail = {
  agency: AgencySummary;
  history: AgencyHistoryMonth[];
  topics: AgencyTopic[];
};

type AgencyHistorySeries = {
  agency: AgencySummary;
  history: AgencyHistoryMonth[];
};

type AgencyCatalogEntry = {
  slug: string;
  name: string;
  shortName: string | null;
  imported: boolean;
};

type OverviewRow = {
  agency: AgencySummary;
  history: AgencyHistoryMonth[];
  totalChanges: number;
  totalAmendments: number;
  totalRemovals: number;
};

const HISTORY_WINDOWS = [6, 12, 24] as const;
type HistoryWindow = (typeof HISTORY_WINDOWS)[number];

const SORT_LABELS: Record<string, string> = {
  wordCount: "Word footprint",
  latest: "Latest amended",
  topicCount: "Topic load",
  name: "Alphabetical",
};

const formatNumber = new Intl.NumberFormat("en-US");
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
const monthYearFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

const checksum = (value: string) => value.slice(0, 10);
const historyTotal = (history: AgencyHistoryMonth) => history.amendmentCount + history.removalCount;

const topicLabel = (topic: AgencyTopic) =>
  [
    `Title ${topic.title}`,
    topic.subtitle && `Subtitle ${topic.subtitle}`,
    topic.chapter && `Chapter ${topic.chapter}`,
    topic.subchapter && `Subchapter ${topic.subchapter}`,
    topic.part && `Part ${topic.part}`,
  ]
    .filter(Boolean)
    .join(" / ");

function parseMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(year, value - 1, 1);
}

function formatMonth(month: string) {
  return monthFormatter.format(parseMonth(month));
}

function formatMonthWithYear(month: string) {
  return monthYearFormatter.format(parseMonth(month));
}

function buildMonthWindow(months: string[], count: HistoryWindow) {
  if (!months.length) return [];
  const latest = months.reduce((current, next) => (next > current ? next : current));
  const latestDate = parseMonth(latest);
  const window: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const month = new Date(latestDate.getFullYear(), latestDate.getMonth() - index, 1);
    window.push(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`);
  }
  return window;
}

function deltaLabel(current: number, previous: number) {
  if (!previous) {
    return current ? "+100%" : "0%";
  }
  const delta = ((current - previous) / previous) * 100;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)}%`;
}

function riskLabel(removals: number) {
  if (removals >= 4) return "Elevated";
  if (removals > 0) return "Watching";
  return "Stable";
}

function searchTerms(value: string) {
  return value
    .toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function scoreAgencySearch(agency: AgencyCatalogEntry, rawSearch: string) {
  const terms = searchTerms(rawSearch);
  if (!terms.length) return agency.imported ? 0 : 1;

  const searchableValues = [agency.name.toLowerCase(), (agency.shortName ?? "").toLowerCase(), agency.slug.toLowerCase()];
  const searchableTokens = searchableValues.flatMap((value) => value.split(/[\s/-]+/).filter(Boolean));
  let score = 0;

  for (const term of terms) {
    if (searchableValues.some((value) => value === term)) {
      score += 150;
      continue;
    }
    if (searchableTokens.some((value) => value === term)) {
      score += 130;
      continue;
    }
    if (searchableValues.some((value) => value.startsWith(term))) {
      score += 100;
      continue;
    }
    if (searchableTokens.some((value) => value.startsWith(term))) {
      score += 80;
      continue;
    }
    if (searchableValues.some((value) => value.includes(term))) {
      score += 50;
      continue;
    }
    return -1;
  }

  return score + (agency.imported ? 0 : 8);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function AgencyHeatmap({
  rows,
  months,
  selectedSlug,
  onSelectAgency,
}: {
  rows: OverviewRow[];
  months: string[];
  selectedSlug: string | null;
  onSelectAgency: (slug: string) => void;
}) {
  if (!rows.length || !months.length) {
    return (
      <section className="panel heatmap-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Change intensity heatmap</p>
            <h2>Awaiting imported agency history</h2>
          </div>
        </div>
        <p className="panel-copy muted-copy">Use New Analysis to import agencies into this workspace.</p>
      </section>
    );
  }

  const maxChange = Math.max(1, ...rows.flatMap((row) => row.history.map(historyTotal)));

  return (
    <section className="panel heatmap-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Change intensity heatmap</p>
          <h2>Cross-agency change density</h2>
          <p className="panel-copy">Scan where monthly amendments and removals are clustering, then drill into a single agency.</p>
        </div>
        <div className="panel-meta">
          <span>Lighter</span>
          <div className="heatmap-scale" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span>Darker</span>
        </div>
      </div>

      <div className="heatmap-scroll">
        <div className="heatmap-grid" style={{ gridTemplateColumns: `minmax(220px, 1.55fr) repeat(${months.length}, minmax(44px, 1fr))` }}>
          <div className="heatmap-corner">
            <span>Agency</span>
            <small>Monthly substantive changes</small>
          </div>
          {months.map((month) => (
            <div className="heatmap-month" key={month}>
              <span>{formatMonth(month)}</span>
              <small>{month.slice(2, 4)}</small>
            </div>
          ))}

          {rows.map((row) => (
            <Fragment key={row.agency.slug}>
              <button
                className={`heatmap-row-label ${row.agency.slug === selectedSlug ? "selected" : ""}`}
                onClick={() => onSelectAgency(row.agency.slug)}
                type="button"
              >
                <strong>{row.agency.name}</strong>
                <small>
                  {row.totalChanges} changes · {row.totalRemovals} removals
                </small>
              </button>
              {row.history.map((entry) => {
                const total = historyTotal(entry);
                const intensity = total === 0 ? 0.1 : 0.22 + (total / maxChange) * 0.78;
                const style = {
                  backgroundColor: `rgba(173, 198, 255, ${intensity})`,
                  color: intensity > 0.62 ? "#08101f" : "#d9e2fd",
                } satisfies CSSProperties;
                return (
                  <div
                    className={`heatmap-cell ${row.agency.slug === selectedSlug ? "selected" : ""}`}
                    key={`${row.agency.slug}-${entry.month}`}
                    style={style}
                    title={`${row.agency.name}, ${formatMonthWithYear(entry.month)}: ${entry.amendmentCount} amendments, ${entry.removalCount} removals`}
                  >
                    <span>{total}</span>
                    {entry.removalCount > 0 && <small>{entry.removalCount}r</small>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function VolumeChart({ history }: { history: AgencyHistoryMonth[] }) {
  if (!history.length) {
    return <p className="muted-copy">No historical amendment activity is available for the selected agency.</p>;
  }

  const bars = history.slice(-8);
  const max = Math.max(1, ...bars.map(historyTotal));

  return (
    <div className="volume-chart">
      {bars.map((entry) => {
        const total = historyTotal(entry);
        const totalHeight = `${(total / max) * 100}%`;
        const removalHeight = total ? `${(entry.removalCount / total) * 100}%` : "0%";
        return (
          <div className="volume-column" key={entry.month}>
            <div className="volume-track">
              <div className="volume-fill" style={{ height: totalHeight }}>
                <span className="volume-removal" style={{ height: removalHeight }} />
              </div>
            </div>
            <small>{formatMonth(entry.month)}</small>
          </div>
        );
      })}
    </div>
  );
}

function NewAnalysisModal({
  open,
  candidates,
  loading,
  search,
  selectedSlugs,
  importing,
  feedback,
  onClose,
  onSearchChange,
  onToggle,
  onSelectVisible,
  onClearSelection,
  onSubmit,
}: {
  open: boolean;
  candidates: AgencyCatalogEntry[];
  loading: boolean;
  search: string;
  selectedSlugs: string[];
  importing: boolean;
  feedback: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onToggle: (slug: string) => void;
  onSelectVisible: (slugs: string[]) => void;
  onClearSelection: () => void;
  onSubmit: () => void;
}) {
  const deferredSearch = useDeferredValue(search);
  const visibleCandidates = candidates
    .map((candidate) => ({ candidate, score: scoreAgencySearch(candidate, deferredSearch) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.candidate.imported !== right.candidate.imported) return Number(left.candidate.imported) - Number(right.candidate.imported);
      return left.candidate.name.localeCompare(right.candidate.name);
    })
    .map((entry) => entry.candidate);
  const visibleSlugs = visibleCandidates.map((candidate) => candidate.slug);
  const allVisibleSelected = visibleSlugs.length > 0 && visibleSlugs.every((slug) => selectedSlugs.includes(slug));
  const selectedEntries = selectedSlugs
    .map((slug) => candidates.find((candidate) => candidate.slug === slug))
    .filter((candidate): candidate is AgencyCatalogEntry => Boolean(candidate));

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-analysis-title">
        <div className="modal-header">
          <div>
            <p className="panel-kicker">New analysis</p>
            <h2 id="new-analysis-title">Add or refresh agencies</h2>
            <p className="panel-copy">Search the live eCFR agency catalog, select multiple agencies, and import them into this workspace. Imports can take a moment.</p>
          </div>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close new analysis">
            Close
          </button>
        </div>

        <div className="modal-tools">
          <label className="modal-search">
            <span>Search agencies</span>
            <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by agency, short name, or slug" />
          </label>
          <div className="modal-tools-right">
            <div className="modal-counts">
              <span>{visibleCandidates.length} matches</span>
              <span>{selectedSlugs.length} selected</span>
            </div>
            <div className="modal-batch-actions">
              <button className="text-action" onClick={() => onSelectVisible(visibleSlugs)} type="button" disabled={!visibleCandidates.length || allVisibleSelected}>
                Select visible
              </button>
              <button className="text-action" onClick={onClearSelection} type="button" disabled={!selectedSlugs.length}>
                Clear
              </button>
            </div>
          </div>
        </div>

        {!!selectedEntries.length && (
          <div className="selected-strip">
            {selectedEntries.map((entry) => (
              <button className="selected-chip" key={entry.slug} onClick={() => onToggle(entry.slug)} type="button">
                {entry.name}
              </button>
            ))}
          </div>
        )}

        <div className="candidate-list">
          {loading ? (
            <p className="muted-copy">Loading live agency catalog...</p>
          ) : visibleCandidates.length ? (
            visibleCandidates.map((candidate) => {
              const selected = selectedSlugs.includes(candidate.slug);
              return (
                <button className={`candidate-row ${selected ? "selected" : ""}`} key={candidate.slug} onClick={() => onToggle(candidate.slug)} type="button">
                  <div className="candidate-copy">
                    <strong>{candidate.name}</strong>
                    <small>{candidate.shortName ? `${candidate.shortName} · ${candidate.slug}` : candidate.slug}</small>
                  </div>
                  <div className="candidate-meta">
                    <span className={`candidate-badge ${candidate.imported ? "imported" : "available"}`}>
                      {candidate.imported ? "Imported" : "Available"}
                    </span>
                    <span className="candidate-check">{selected ? "Selected" : candidate.imported ? "Refresh" : "Add"}</span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="muted-copy">No agencies matched the current search.</p>
          )}
        </div>

        <div className="modal-actions">
          {!!feedback && <p className="modal-feedback">{feedback}</p>}
          <button className="ghost-action" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-action" onClick={onSubmit} type="button" disabled={!selectedSlugs.length || importing}>
            {importing ? "Importing..." : `Import ${selectedSlugs.length || ""}`.trim()}
          </button>
        </div>
      </section>
    </div>
  );
}

function ImportLoadingScreen({
  open,
  selectedCount,
  selectedNames,
}: {
  open: boolean;
  selectedCount: number;
  selectedNames: string[];
}) {
  if (!open) return null;

  return (
    <div className="import-loading-screen" role="status" aria-live="polite" aria-label="Importing selected agencies">
      <div className="import-loading-panel">
        <span className="import-loading-spinner" aria-hidden="true" />
        <p className="panel-kicker">Import in progress</p>
        <h2>Building your new analysis workspace</h2>
        <p className="panel-copy">
          Pulling current eCFR snapshots, topic previews, and monthly history for {selectedCount} selected {selectedCount === 1 ? "agency" : "agencies"}.
        </p>
        {!!selectedNames.length && (
          <div className="import-loading-chiplist">
            {selectedNames.map((name) => (
              <span className="import-loading-chip" key={name}>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [agencies, setAgencies] = useState<AgencySummary[]>([]);
  const [overview, setOverview] = useState<AgencyHistorySeries[]>([]);
  const [catalog, setCatalog] = useState<AgencyCatalogEntry[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgencyDetail | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"wordCount" | "latest" | "topicCount" | "name">("wordCount");
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>(12);
  const [intensityFloor, setIntensityFloor] = useState(0);
  const [loading, setLoading] = useState("Loading regulatory intelligence...");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [analysisSelection, setAnalysisSelection] = useState<string[]>([]);
  const [importingSelection, setImportingSelection] = useState(false);
  const [analysisFeedback, setAnalysisFeedback] = useState("");
  const deferredQuery = useDeferredValue(query);

  async function loadDashboard(options?: { preferredSlug?: string | null }) {
    const [agencyRows, overviewRows] = await Promise.all([
      request<AgencySummary[]>("/api/agencies"),
      request<AgencyHistorySeries[]>("/api/overview/history"),
    ]);
    setAgencies(agencyRows);
    setOverview(overviewRows);
    setLoading("");

    const nextSlug = options?.preferredSlug ?? selectedSlug;
    if (nextSlug && agencyRows.some((agency) => agency.slug === nextSlug)) {
      startTransition(() => setSelectedSlug(nextSlug));
    } else if (agencyRows[0]) {
      startTransition(() => setSelectedSlug(agencyRows[0].slug));
    } else {
      setSelectedSlug(null);
      setDetail(null);
      setSelectedTopicId(null);
    }
  }

  async function loadCatalog() {
    setCatalogLoading(true);
    try {
      const nextCatalog = await request<AgencyCatalogEntry[]>("/api/admin/agencies");
      setCatalog(nextCatalog);
      return nextCatalog;
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch((error: Error) => setLoading(error.message));
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    request<AgencyDetail>(`/api/agencies/${selectedSlug}`)
      .then((payload) => {
        setDetail(payload);
        setSelectedTopicId((current) => current ?? payload.topics[0]?.id ?? null);
      })
      .catch((error: Error) => setLoading(error.message));
  }, [selectedSlug]);

  const windowMonths = buildMonthWindow(
    overview.flatMap((series) => series.history.map((entry) => entry.month)),
    historyWindow,
  );
  const overviewBySlug = new Map(overview.map((series) => [series.agency.slug, series]));

  function buildOverviewRow(agency: AgencySummary): OverviewRow {
    const historyMap = new Map((overviewBySlug.get(agency.slug)?.history ?? []).map((entry) => [entry.month, entry]));
    const history = windowMonths.map(
      (month) =>
        historyMap.get(month) ?? {
          month,
          amendmentCount: 0,
          removalCount: 0,
        },
    );

    return {
      agency,
      history,
      totalChanges: history.reduce((sum, entry) => sum + historyTotal(entry), 0),
      totalAmendments: history.reduce((sum, entry) => sum + entry.amendmentCount, 0),
      totalRemovals: history.reduce((sum, entry) => sum + entry.removalCount, 0),
    };
  }

  const matchedAgencies = agencies
    .filter((agency) => agency.name.toLowerCase().includes(deferredQuery.toLowerCase()))
    .sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "topicCount") return right.topicCount - left.topicCount;
      if (sort === "latest") return (right.latestAmendedOn ?? "").localeCompare(left.latestAmendedOn ?? "");
      return right.wordCount - left.wordCount;
    });

  const allWindowRows = matchedAgencies.map(buildOverviewRow);
  const maxWindowChanges = Math.max(0, ...allWindowRows.map((row) => row.totalChanges));
  const clampedIntensityFloor = Math.min(intensityFloor, maxWindowChanges);
  const visibleRows = allWindowRows.filter((row) => row.totalChanges >= clampedIntensityFloor);
  const selectedOverviewRow =
    (selectedSlug ? agencies.find((agency) => agency.slug === selectedSlug) : null) && selectedSlug
      ? buildOverviewRow(agencies.find((agency) => agency.slug === selectedSlug)!)
      : visibleRows[0] ?? null;

  const selectedTopic = detail?.topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const primaryTopic = selectedTopic ?? detail?.topics[0] ?? null;
  const latestHistory = selectedOverviewRow?.history.at(-1);
  const previousHistory = selectedOverviewRow?.history.at(-2);
  const totalTopics = agencies.reduce((sum, agency) => sum + agency.topicCount, 0);
  const topContributors = [...visibleRows].sort((left, right) => right.totalChanges - left.totalChanges).slice(0, 4);
  const riskState = riskLabel(selectedOverviewRow?.totalRemovals ?? 0);
  const latestAgencyDate = agencies
    .map((agency) => agency.latestAmendedOn)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const importingAgencyNames = analysisSelection
    .map((slug) => catalog.find((agency) => agency.slug === slug)?.name ?? slug)
    .slice(0, 4);

  async function openTopic(topic: AgencyTopic) {
    setSelectedTopicId(topic.id);
    try {
      const result = await request<{ viewCount: number }>(`/api/topics/${topic.id}/view`, { method: "POST" });
      setDetail((current) =>
        current
          ? {
              ...current,
              topics: current.topics.map((item) => (item.id === topic.id ? { ...item, viewCount: result.viewCount } : item)),
            }
          : current,
      );
    } catch (error) {
      setLoading(error instanceof Error ? error.message : "Unable to update topic view count");
    }
  }

  function selectAgency(slug: string) {
    startTransition(() => {
      setSelectedSlug(slug);
      setSelectedTopicId(null);
    });
  }

  function exportAgencySnapshot() {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${detail.agency.slug}-snapshot.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openAnalysisModal() {
    setAnalysisModalOpen(true);
    setAnalysisSearch("");
    setAnalysisSelection([]);
    setAnalysisFeedback("");
    try {
      await loadCatalog();
    } catch (error) {
      setAnalysisFeedback(error instanceof Error ? error.message : "Unable to load the agency catalog");
    }
  }

  function toggleAnalysisSelection(slug: string) {
    setAnalysisSelection((current) => (current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug]));
  }

  function selectVisibleAgencies(slugs: string[]) {
    setAnalysisSelection((current) => [...new Set([...current, ...slugs])]);
  }

  async function submitAnalysisSelection() {
    if (!analysisSelection.length) return;
    setImportingSelection(true);
    setAnalysisFeedback("");
    try {
      await request("/api/admin/agencies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: analysisSelection }),
      });
      const preferredSlug = analysisSelection[0] ?? selectedSlug;
      await Promise.all([loadDashboard({ preferredSlug }), loadCatalog()]);
      setAnalysisModalOpen(false);
      setAnalysisSelection([]);
    } catch (error) {
      setAnalysisFeedback(error instanceof Error ? error.message : "Unable to import the selected agencies");
    } finally {
      setImportingSelection(false);
    }
  }

  return (
    <div className="obsidian-app">
      <header className="obsidian-topbar">
        <div className="brand-lockup">
          <span className="brand-name">eCFR Explorer</span>
          <span className="brand-subtitle">Regulatory Core</span>
        </div>

        <label className="top-search">
          <span>Search imported agencies</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search imported agencies..." />
        </label>

        <div className="top-status">
          <div className="status-pill">
            <span>Imported</span>
            <strong>{agencies.length}</strong>
          </div>
          <div className="status-pill">
            <span>Latest amend</span>
            <strong>{latestAgencyDate ?? "n/a"}</strong>
          </div>
        </div>
      </header>

      <aside className="obsidian-sidebar">
        <div className="sidebar-heading">
          <p className="sidebar-kicker">Agency operations</p>
          <p className="sidebar-title">Workspace scope</p>
        </div>

        <div className="sidebar-summary">
          <div className="sidebar-summary-row">
            <span>Agencies loaded</span>
            <strong>{agencies.length}</strong>
          </div>
          <div className="sidebar-summary-row">
            <span>Topics loaded</span>
            <strong>{totalTopics}</strong>
          </div>
        </div>

        <div className="sidebar-actions">
          <button className="sidebar-cta" onClick={() => void openAnalysisModal()} type="button">
            New analysis
          </button>
          <p className="sidebar-note">Search the live eCFR catalog, select multiple agencies, and import them here.</p>
        </div>

        <div className="sidebar-agency-list">
          <p className="sidebar-list-title">Imported agencies</p>
          {matchedAgencies.length ? (
            matchedAgencies.map((agency) => (
              <button
                className={`sidebar-agency ${agency.slug === selectedSlug ? "selected" : ""}`}
                key={agency.slug}
                onClick={() => selectAgency(agency.slug)}
                type="button"
              >
                <strong>{agency.name}</strong>
                <small>{agency.topicCount} topics</small>
              </button>
            ))
          ) : (
            <p className="muted-copy">No imported agencies matched the current search.</p>
          )}
        </div>
      </aside>

      <main className="obsidian-main">
        <header className="page-header">
          <div>
            <p className="page-kicker">{detail?.agency.name ? `Selected agency: ${detail.agency.name}` : "Imported agency workspace"}</p>
            <h1>Advanced Regulatory Dashboard</h1>
            <p className="page-copy">
              Review imported agency footprints, compare amendment intensity over time, and inspect stored topic previews without placeholder controls.
            </p>
          </div>

          <div className="page-actions">
            <button className="ghost-action" onClick={exportAgencySnapshot} type="button" disabled={!detail}>
              Export snapshot
            </button>
          </div>
        </header>

        <div className="dashboard-layout">
          <div className="control-stack">
            <section className="panel control-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Filter parameters</p>
                  <h2>Imported scope</h2>
                </div>
              </div>

              <div className="field-stack">
                <label className="field-group">
                  <span>Agency</span>
                  <select value={selectedSlug ?? ""} onChange={(event) => selectAgency(event.target.value)} disabled={!agencies.length}>
                    {agencies.map((agency) => (
                      <option key={agency.slug} value={agency.slug}>
                        {agency.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group">
                  <span>Sort imported agencies</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field-group">
                  <span>History window</span>
                  <div className="window-toggle">
                    {HISTORY_WINDOWS.map((window) => (
                      <button className={window === historyWindow ? "selected" : ""} key={window} onClick={() => setHistoryWindow(window)} type="button">
                        Last {window}m
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field-group">
                  <span>Minimum visible change count</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(maxWindowChanges, 1)}
                    value={clampedIntensityFloor}
                    onChange={(event) => setIntensityFloor(Number(event.target.value))}
                  />
                  <div className="range-meta">
                    <small>All imported</small>
                    <strong>{clampedIntensityFloor}+</strong>
                    <small>Highest change only</small>
                  </div>
                </label>
              </div>

              <button className="secondary-action" onClick={() => setIntensityFloor(0)} type="button">
                Reset filter floor
              </button>
            </section>

            <section className="panel quick-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Workspace summary</p>
                  <h2>Current posture</h2>
                </div>
              </div>

              <dl className="quick-stats">
                <div>
                  <dt>Visible agencies</dt>
                  <dd>
                    {visibleRows.length} / {matchedAgencies.length || agencies.length || 0}
                  </dd>
                </div>
                <div>
                  <dt>Monthly delta</dt>
                  <dd>
                    {deltaLabel(
                      historyTotal(latestHistory ?? { month: "", amendmentCount: 0, removalCount: 0 }),
                      historyTotal(previousHistory ?? { month: "", amendmentCount: 0, removalCount: 0 }),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Removal pressure</dt>
                  <dd className={`tone-${riskState.toLowerCase()}`}>{riskState}</dd>
                </div>
              </dl>

              <div className="risk-meter" aria-hidden="true">
                <span style={{ width: `${selectedOverviewRow && maxWindowChanges ? (selectedOverviewRow.totalChanges / maxWindowChanges) * 100 : 0}%` }} />
              </div>
            </section>
          </div>

          <div className="canvas-stack">
            <div className="hero-row">
              <AgencyHeatmap rows={visibleRows} months={windowMonths} selectedSlug={selectedSlug} onSelectAgency={selectAgency} />

              <section className="panel alert-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Removal pressure</p>
                    <h2>{selectedOverviewRow?.totalRemovals ?? 0}</h2>
                  </div>
                </div>

                <div className="alert-copy">
                  <p>{selectedOverviewRow?.agency.name ?? "No agency selected"}</p>
                  <strong>{riskState} in the current window</strong>
                </div>

                <dl className="alert-metrics">
                  <div>
                    <dt>Latest amended</dt>
                    <dd>{selectedOverviewRow?.agency.latestAmendedOn ?? "No amendment date"}</dd>
                  </div>
                  <div>
                    <dt>Window scope</dt>
                    <dd>{historyWindow} month scan</dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="secondary-row">
              <section className="panel volume-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Volume trend</p>
                    <h2>{selectedOverviewRow?.agency.name ?? "Agency activity"}</h2>
                    <p className="panel-copy">Monthly amendment volume plus removals for the currently selected agency.</p>
                  </div>
                </div>
                <VolumeChart history={selectedOverviewRow?.history ?? []} />
              </section>

              <section className="panel ranking-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Top contributing agencies</p>
                    <h2>Visible leaders</h2>
                  </div>
                </div>

                <ul className="ranking-list">
                  {topContributors.map((row) => (
                    <li key={row.agency.slug}>
                      <div>
                        <strong>{row.agency.name}</strong>
                        <small>{row.totalAmendments} amendments</small>
                      </div>
                      <div className="ranking-bar">
                        <span style={{ width: `${maxWindowChanges ? (row.totalChanges / maxWindowChanges) * 100 : 0}%` }} />
                      </div>
                      <strong>{compactNumber.format(row.totalChanges)}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="panel signal-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Selected topic signal</p>
                    <h2>{primaryTopic ? topicLabel(primaryTopic) : "No topic selected"}</h2>
                    <p className="panel-copy">This panel only shows metrics from the currently selected topic. Click a topic row below to update it.</p>
                  </div>
                </div>

                {primaryTopic ? (
                  <dl className="signal-metrics">
                    <div>
                      <dt>Views</dt>
                      <dd>{primaryTopic.viewCount}</dd>
                    </div>
                    <div>
                      <dt>Word count</dt>
                      <dd>{formatNumber.format(primaryTopic.wordCount)}</dd>
                    </div>
                    <div>
                      <dt>Checksum</dt>
                      <dd>{checksum(primaryTopic.checksum)}</dd>
                    </div>
                    <div>
                      <dt>Topics in agency</dt>
                      <dd>{detail?.topics.length ?? 0}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="muted-copy">No topic has been selected yet.</p>
                )}
              </section>
            </div>

            <section className="panel dossier-panel" id="agency-dossier">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Tracked topics</p>
                  <h2>{detail?.agency.name ?? "Agency topic dossier"}</h2>
                  <p className="panel-copy">Open any tracked topic to increment its live attention count and inspect the stored preview.</p>
                </div>
              </div>

              {loading && !detail ? (
                <p className="muted-copy">{loading}</p>
              ) : detail ? (
                <div className="dossier-layout">
                  <div className="movement-list">
                    {detail.topics.map((topic) => (
                      <button
                        className={`movement-row ${topic.id === selectedTopicId ? "selected" : ""}`}
                        key={topic.id}
                        onClick={() => openTopic(topic)}
                        type="button"
                      >
                        <span className={`movement-dot tone-${topic.id === selectedTopicId ? "hot" : "calm"}`} aria-hidden="true" />
                        <div className="movement-copy">
                          <span className="movement-chip">{topic.viewCount > 0 ? "Viewed topic" : "Tracked topic"}</span>
                          <strong>{topicLabel(topic)}</strong>
                          <p>{topic.previewText}</p>
                        </div>
                        <div className="movement-meta">
                          <small>{formatNumber.format(topic.wordCount)} words</small>
                          <small>{topic.viewCount} views</small>
                        </div>
                      </button>
                    ))}

                    {!detail.topics.length && <p className="muted-copy">No topics were returned for this agency.</p>}
                  </div>

                  <aside className="preview-card">
                    <p className="panel-kicker">Selected topic preview</p>
                    {primaryTopic ? (
                      <>
                        <h3>{topicLabel(primaryTopic)}</h3>
                        <p>{primaryTopic.previewText}</p>

                        <dl className="preview-metrics">
                          <div>
                            <dt>Views</dt>
                            <dd>{primaryTopic.viewCount} live views</dd>
                          </div>
                          <div>
                            <dt>Checksum</dt>
                            <dd>{checksum(primaryTopic.checksum)}</dd>
                          </div>
                          <div>
                            <dt>Word count</dt>
                            <dd>{formatNumber.format(primaryTopic.wordCount)}</dd>
                          </div>
                          <div>
                            <dt>Latest amended</dt>
                            <dd>{detail.agency.latestAmendedOn ?? "n/a"}</dd>
                          </div>
                        </dl>
                      </>
                    ) : (
                      <p className="muted-copy">Select a topic row to inspect its stored preview.</p>
                    )}
                  </aside>
                </div>
              ) : (
                <p className="muted-copy">No agencies have been imported yet.</p>
              )}
            </section>
          </div>
        </div>
      </main>

      <NewAnalysisModal
        open={analysisModalOpen}
        candidates={catalog}
        loading={catalogLoading}
        search={analysisSearch}
        selectedSlugs={analysisSelection}
        importing={importingSelection}
        feedback={analysisFeedback}
        onClose={() => setAnalysisModalOpen(false)}
        onSearchChange={setAnalysisSearch}
        onToggle={toggleAnalysisSelection}
        onSelectVisible={selectVisibleAgencies}
        onClearSelection={() => setAnalysisSelection([])}
        onSubmit={() => void submitAnalysisSelection()}
      />

      <ImportLoadingScreen open={importingSelection} selectedCount={analysisSelection.length} selectedNames={importingAgencyNames} />
    </div>
  );
}
