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

type OverviewRow = {
  agency: AgencySummary;
  history: AgencyHistoryMonth[];
  totalChanges: number;
  totalAmendments: number;
  totalRemovals: number;
};

const HISTORY_WINDOWS = [6, 12, 24] as const;
type HistoryWindow = (typeof HISTORY_WINDOWS)[number];

const NAV_ITEMS = [
  { label: "Intelligence", active: true },
  { label: "Regulatory Track", active: false },
  { label: "Risk Analysis", active: false },
  { label: "Compliance Vault", active: false },
  { label: "Reporting", active: false },
];

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
            <p className="panel-kicker">Mandate intensity heatmap</p>
            <h2>Awaiting imported agency history</h2>
          </div>
        </div>
        <p className="panel-copy muted-copy">Refresh eCFR data to populate the cross-agency comparison surface.</p>
      </section>
    );
  }

  const maxChange = Math.max(1, ...rows.flatMap((row) => row.history.map(historyTotal)));

  return (
    <section className="panel heatmap-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Mandate intensity heatmap</p>
          <h2>Cross-agency change density</h2>
          <p className="panel-copy">Inspired by the reference dashboard: use the matrix to scan where regulatory change is accumulating fastest.</p>
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
                  {row.totalChanges} shifts · {row.totalRemovals} removals
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
                    <span>{total || "0"}</span>
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

export default function App() {
  const [agencies, setAgencies] = useState<AgencySummary[]>([]);
  const [overview, setOverview] = useState<AgencyHistorySeries[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgencyDetail | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"wordCount" | "latest" | "topicCount" | "name">("wordCount");
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>(12);
  const [intensityFloor, setIntensityFloor] = useState(0);
  const [loading, setLoading] = useState("Loading regulatory intelligence...");
  const [refreshing, setRefreshing] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    Promise.all([request<AgencySummary[]>("/api/agencies"), request<AgencyHistorySeries[]>("/api/overview/history")])
      .then(([agencyRows, overviewRows]) => {
        setAgencies(agencyRows);
        setOverview(overviewRows);
        setLoading("");
        if (!selectedSlug && agencyRows[0]) {
          startTransition(() => setSelectedSlug(agencyRows[0].slug));
        }
      })
      .catch((error: Error) => setLoading(error.message));
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
  const recentTopics = [...(detail?.topics ?? [])]
    .sort((left, right) => right.viewCount - left.viewCount || right.wordCount - left.wordCount)
    .slice(0, 4);
  const primaryTopic = selectedTopic ?? recentTopics[0] ?? null;
  const latestHistory = selectedOverviewRow?.history.at(-1);
  const previousHistory = selectedOverviewRow?.history.at(-2);
  const totalTopics = agencies.reduce((sum, agency) => sum + agency.topicCount, 0);
  const topContributors = [...visibleRows].sort((left, right) => right.totalChanges - left.totalChanges).slice(0, 4);
  const riskState = riskLabel(selectedOverviewRow?.totalRemovals ?? 0);

  async function refreshImport() {
    setRefreshing(true);
    try {
      await request("/api/admin/import", { method: "POST" });
      const [agencyRows, overviewRows] = await Promise.all([
        request<AgencySummary[]>("/api/agencies"),
        request<AgencyHistorySeries[]>("/api/overview/history"),
      ]);
      setAgencies(agencyRows);
      setOverview(overviewRows);
      if (selectedSlug) {
        setDetail(await request<AgencyDetail>(`/api/agencies/${selectedSlug}`));
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function openTopic(topic: AgencyTopic) {
    setSelectedTopicId(topic.id);
    const result = await request<{ viewCount: number }>(`/api/topics/${topic.id}/view`, { method: "POST" });
    setDetail((current) =>
      current
        ? {
            ...current,
            topics: current.topics.map((item) => (item.id === topic.id ? { ...item, viewCount: result.viewCount } : item)),
          }
        : current,
    );
  }

  function selectAgency(slug: string) {
    startTransition(() => {
      setSelectedSlug(slug);
      setSelectedTopicId(null);
    });
  }

  function inspectPriorityTopic() {
    const target = recentTopics[0] ?? detail?.topics[0];
    if (target) {
      void openTopic(target);
      document.getElementById("agency-dossier")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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

  return (
    <div className="obsidian-app">
      <header className="obsidian-topbar">
        <div className="brand-lockup">
          <span className="brand-name">eCFR Explorer</span>
          <span className="brand-subtitle">Regulatory Core</span>
        </div>

        <label className="top-search">
          <span>Search regulatory core</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search regulatory core..." />
        </label>

        <div className="top-actions">
          <button className="chrome-button" type="button" aria-label="Notifications">
            N
          </button>
          <button className="chrome-button" type="button" aria-label="Settings">
            S
          </button>
          <div className="avatar-badge" aria-label="Workspace profile">
            EC
          </div>
        </div>
      </header>

      <aside className="obsidian-sidebar">
        <div className="sidebar-heading">
          <p className="sidebar-kicker">The Analytical Nocturne</p>
          <p className="sidebar-title">Regulatory Core</p>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => (
            <a className={`sidebar-link ${item.active ? "active" : ""}`} href="#" key={item.label}>
              <span className="sidebar-marker" aria-hidden="true" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-cta" onClick={refreshImport} disabled={refreshing} type="button">
            {refreshing ? "Refreshing..." : "New Analysis"}
          </button>
          <div className="sidebar-meta">
            <span>Imported agencies</span>
            <strong>{agencies.length}</strong>
          </div>
        </div>
      </aside>

      <main className="obsidian-main">
        <header className="page-header">
          <div>
            <p className="page-kicker">
              {detail?.agency.name ? `Focused agency: ${detail.agency.name}` : "Regulatory intelligence"}
            </p>
            <h1>Advanced Regulatory Dashboard</h1>
            <p className="page-copy">
              Real-time tracking of federal mandate shifts, agency throughput, and topic attention across {agencies.length || 0} imported
              departments and {totalTopics || 0} tracked topics.
            </p>
          </div>

          <div className="page-actions">
            <button className="ghost-action" onClick={exportAgencySnapshot} type="button" disabled={!detail}>
              Export
            </button>
            <button className="primary-action" onClick={inspectPriorityTopic} type="button" disabled={!detail?.topics.length}>
              Impact Analysis
            </button>
          </div>
        </header>

        <div className="dashboard-layout">
          <div className="control-stack">
            <section className="panel control-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Filter parameters</p>
                  <h2>Operational scope</h2>
                </div>
              </div>

              <div className="field-stack">
                <label className="field-group">
                  <span>Federal agency</span>
                  <select value={selectedSlug ?? ""} onChange={(event) => selectAgency(event.target.value)} disabled={!agencies.length}>
                    {agencies.map((agency) => (
                      <option key={agency.slug} value={agency.slug}>
                        {agency.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group">
                  <span>Analysis order</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field-group">
                  <span>Analysis period</span>
                  <div className="window-toggle">
                    {HISTORY_WINDOWS.map((window) => (
                      <button
                        className={window === historyWindow ? "selected" : ""}
                        key={window}
                        onClick={() => setHistoryWindow(window)}
                        type="button"
                      >
                        Last {window}m
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field-group">
                  <span>Change intensity floor</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(maxWindowChanges, 1)}
                    value={clampedIntensityFloor}
                    onChange={(event) => setIntensityFloor(Number(event.target.value))}
                  />
                  <div className="range-meta">
                    <small>Low volume</small>
                    <strong>{clampedIntensityFloor}+</strong>
                    <small>Critical only</small>
                  </div>
                </label>
              </div>

              <button className="secondary-action" onClick={() => setIntensityFloor(0)} type="button">
                Reset filters
              </button>
            </section>

            <section className="panel quick-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Quick insights</p>
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
                  <dd>{deltaLabel(historyTotal(latestHistory ?? { month: "", amendmentCount: 0, removalCount: 0 }), historyTotal(previousHistory ?? { month: "", amendmentCount: 0, removalCount: 0 }))}</dd>
                </div>
                <div>
                  <dt>Risk exposure</dt>
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
                    <p className="panel-kicker">Critical alerts</p>
                    <h2>{selectedOverviewRow?.totalRemovals ?? 0}</h2>
                  </div>
                </div>

                <div className="alert-copy">
                  <p>{selectedOverviewRow?.agency.name ?? "No agency selected"}</p>
                  <strong>{riskState} removal pressure</strong>
                </div>

                <dl className="alert-metrics">
                  <div>
                    <dt>Next review</dt>
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
                    <p className="panel-kicker">Volume trend analysis</p>
                    <h2>{selectedOverviewRow?.agency.name ?? "Agency activity"}</h2>
                    <p className="panel-copy">Daily publication counts are not stored, so this view reflects monthly substantive amendments plus removals.</p>
                  </div>
                </div>
                <VolumeChart history={selectedOverviewRow?.history ?? []} />
              </section>

              <section className="panel ranking-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Top contributing agencies</p>
                    <h2>Current leaders</h2>
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

              <section className="impact-panel">
                <p className="panel-kicker">Focused topic analysis</p>
                <h2>{primaryTopic ? topicLabel(primaryTopic) : "No topic selected"}</h2>
                <p>
                  {primaryTopic
                    ? "Leverage the stored XML preview and live view telemetry to inspect the highest-attention topic for the current agency."
                    : "Select an agency topic to open its stored preview and attention metrics."}
                </p>
                <button className="impact-button" onClick={inspectPriorityTopic} type="button" disabled={!primaryTopic}>
                  Launch simulation
                </button>
              </section>
            </div>

            <section className="panel dossier-panel" id="agency-dossier">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Recent regulatory movements</p>
                  <h2>{detail?.agency.name ?? "Agency dossier"}</h2>
                  <p className="panel-copy">Click a topic row to increment its live attention count and inspect the stored preview.</p>
                </div>
              </div>

              {loading && !detail ? (
                <p className="muted-copy">{loading}</p>
              ) : detail ? (
                <div className="dossier-layout">
                  <div className="movement-list">
                    {recentTopics.map((topic, index) => (
                      <button
                        className={`movement-row ${topic.id === selectedTopicId ? "selected" : ""}`}
                        key={topic.id}
                        onClick={() => openTopic(topic)}
                        type="button"
                      >
                        <span className={`movement-dot tone-${index === 0 ? "hot" : index === 1 ? "watch" : "calm"}`} aria-hidden="true" />
                        <div className="movement-copy">
                          <span className="movement-chip">{index === 0 ? "High attention" : index === 1 ? "Most viewed" : "Tracked topic"}</span>
                          <strong>{topicLabel(topic)}</strong>
                          <p>{topic.previewText}</p>
                        </div>
                        <div className="movement-meta">
                          <small>{formatNumber.format(topic.wordCount)} words</small>
                          <small>{topic.viewCount} views</small>
                        </div>
                      </button>
                    ))}

                    {!recentTopics.length && <p className="muted-copy">No topics were returned for this agency.</p>}
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
    </div>
  );
}
