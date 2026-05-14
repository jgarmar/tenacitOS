"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Database,
  Cpu,
  Layers,
  Clock,
  Search,
  Loader2,
  Sparkles,
  FileText,
  Hash,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ZAxis,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface VectorStatus {
  chunks: number;
  files: number;
  model: string;
  vectorDims: number;
  lastIndexedAt: string | null;
  sizeMB: number;
  sources: string[];
}

interface ScatterPoint {
  id: string;
  label: string;
  snippet: string;
  source: string;
  filePath: string;
  x: number;
  y: number;
  updatedAt: string;
}

interface VectorsResponse {
  points: ScatterPoint[];
  totalPoints: number;
  uniqueSources: string[];
  computedAt: string;
}

interface SemanticResult {
  id: string;
  snippet: string;
  source: string;
  filePath: string;
  score: number;
  updatedAt: string;
  startLine: number;
  endLine: number;
}

interface SemanticResponse {
  query: string;
  results: SemanticResult[];
  totalChunks: number;
}

// ── Color palette for sources ──────────────────────────────────────────────

const SOURCE_COLORS = [
  "#FF3B30", // red (accent)
  "#32D74B", // green
  "#0A84FF", // blue
  "#FFD60A", // yellow
  "#BF5AF2", // purple
  "#64D2FF", // cyan
  "#FF9F0A", // orange
  "#FF453A", // coral
  "#30D158", // mint
  "#AC8E68", // brown
];

function getSourceColor(source: string, sources: string[]): string {
  const idx = sources.indexOf(source);
  if (idx === -1) return SOURCE_COLORS[0];
  return SOURCE_COLORS[idx % SOURCE_COLORS.length];
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  payload: ScatterPoint;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "8px",
        padding: "12px",
        maxWidth: "360px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: "6px",
        }}
      >
        {point.label}
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          marginBottom: "8px",
        }}
      >
        {point.snippet}
      </div>
      <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
        <span>📄 {point.filePath}</span>
        <span>🕐 {formatDate(point.updatedAt)}</span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function VectorMemory() {
  const [status, setStatus] = useState<VectorStatus | null>(null);
  const [vectors, setVectors] = useState<VectorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Semantic search state
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SemanticResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Load status and vectors on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [statusRes, vectorsRes] = await Promise.all([
          fetch("/api/memory/vector-status"),
          fetch("/api/memory/vectors"),
        ]);

        if (cancelled) return;

        if (!statusRes.ok) throw new Error("Failed to load vector status");
        if (!vectorsRes.ok) throw new Error("Failed to load vectors");

        const statusData: VectorStatus = await statusRes.json();
        const vectorsData: VectorsResponse = await vectorsRes.json();

        setStatus(statusData);
        setVectors(vectorsData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load vector data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Semantic search handler
  const handleSearch = useCallback(async () => {
    if (!query.trim() || searching) return;

    // Cancel previous request
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearching(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const res = await fetch("/api/memory/semantic-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), limit: 10 }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Search failed");
      }

      const data: SemanticResponse = await res.json();
      setSearchResults(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "400px" }}>
        <Loader2 style={{ width: "32px", height: "32px", color: "var(--accent)" }} className="animate-spin" />
        <span style={{ marginLeft: "12px", color: "var(--text-secondary)", fontSize: "14px" }}>
          Cargando memoria vectorial...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "24px",
          borderRadius: "12px",
          backgroundColor: "var(--negative-soft)",
          border: "1px solid var(--negative)",
          color: "var(--negative)",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>Error cargando memoria vectorial</p>
        <p style={{ fontSize: "13px", opacity: 0.8 }}>{error}</p>
      </div>
    );
  }

  const uniqueSources = vectors?.uniqueSources || [];
  const sourceColorMap: Record<string, string> = {};
  uniqueSources.forEach((s, i) => {
    sourceColorMap[s] = SOURCE_COLORS[i % SOURCE_COLORS.length];
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* ── Stats Cards ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
        <StatCard
          icon={<Database style={{ width: "20px", height: "20px" }} />}
          iconColor="var(--info)"
          title="Chunks indexados"
          value={status?.chunks ?? 0}
        />
        <StatCard
          icon={<FileText style={{ width: "20px", height: "20px" }} />}
          iconColor="var(--positive)"
          title="Archivos"
          value={status?.files ?? 0}
        />
        <StatCard
          icon={<Cpu style={{ width: "20px", height: "20px" }} />}
          iconColor="var(--warning)"
          title="Modelo"
          value={status?.model?.split("/").pop() ?? "—"}
        />
        <StatCard
          icon={<Layers style={{ width: "20px", height: "20px" }} />}
          iconColor="#BF5AF2"
          title="Dimensiones"
          value={status?.vectorDims?.toLocaleString() ?? "—"}
        />
        <StatCard
          icon={<Hash style={{ width: "20px", height: "20px" }} />}
          iconColor="#64D2FF"
          title="Tamaño índice"
          value={`${status?.sizeMB ?? 0} MB`}
        />
        <StatCard
          icon={<Clock style={{ width: "20px", height: "20px" }} />}
          iconColor="var(--text-secondary)"
          title="Última indexación"
          value={status?.lastIndexedAt ? formatDate(status.lastIndexedAt) : "—"}
        />
      </div>

      {/* ── Scatter Plot ────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "4px",
          }}
        >
          Mapa de memoria (PCA 2D)
        </h3>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
          Proyección 2D de los {vectors?.totalPoints ?? 0} chunks por similitud semántica. Pasa el ratón sobre un punto para ver detalles.
        </p>

        {/* Legend */}
        {uniqueSources.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
              padding: "8px 12px",
              backgroundColor: "var(--surface)",
              borderRadius: "8px",
            }}
          >
            {uniqueSources.slice(0, 10).map((source) => (
              <div key={source} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: sourceColorMap[source],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {source}
                </span>
              </div>
            ))}
            {uniqueSources.length > 10 && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                +{uniqueSources.length - 10} más
              </span>
            )}
          </div>
        )}

        <div style={{ width: "100%", height: "420px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="x"
                name="PC1"
                tick={false}
                axisLine={{ stroke: "var(--border)" }}
                label={{ value: "PC1", position: "bottom", fill: "var(--text-muted)", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="PC2"
                tick={false}
                axisLine={{ stroke: "var(--border)" }}
                label={{ value: "PC2", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 11 }}
              />
              <ZAxis range={[30, 30]} />
              <Tooltip content={<CustomTooltip />} />
              {uniqueSources.map((source) => {
                const points = (vectors?.points || []).filter((p) => p.filePath === source);
                return (
                  <Scatter
                    key={source}
                    name={source}
                    data={points}
                    fill={sourceColorMap[source]}
                    fillOpacity={0.7}
                    stroke={sourceColorMap[source]}
                    strokeOpacity={0.3}
                    strokeWidth={1}
                  />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Semantic Search ─────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "4px",
          }}
        >
          Búsqueda semántica
        </h3>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
          Busca por significado, no por palabras clave. Usa embeddings de Gemini para encontrar los chunks más relevantes.
        </p>

        {/* Search input */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "16px",
                height: "16px",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Busca conceptos, temas, recuerdos..."
              style={{
                width: "100%",
                padding: "10px 12px 10px 38px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontFamily: "var(--font-body)",
                outline: "none",
                transition: "border-color 120ms ease",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || query.trim().length < 2}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor: searching || query.trim().length < 2 ? "var(--surface)" : "var(--accent)",
              color: searching || query.trim().length < 2 ? "var(--text-muted)" : "var(--bg, #111)",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: searching || query.trim().length < 2 ? "not-allowed" : "pointer",
              transition: "all 120ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {searching ? (
              <Loader2 style={{ width: "16px", height: "16px" }} className="animate-spin" />
            ) : (
              <Sparkles style={{ width: "16px", height: "16px" }} />
            )}
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {/* Search error */}
        {searchError && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "var(--negative-soft)",
              border: "1px solid var(--negative)",
              color: "var(--negative)",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            {searchError}
          </div>
        )}

        {/* Search results */}
        {searchResults && (
          <div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
              {searchResults.results.length} resultados de {searchResults.totalChunks} chunks para &ldquo;{searchResults.query}&rdquo;
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {searchResults.results.map((result, idx) => (
                <div
                  key={result.id}
                  style={{
                    padding: "14px 16px",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    transition: "border-color 120ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--accent)",
                          backgroundColor: "var(--accent-soft)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        #{idx + 1}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--text-muted)",
                        }}
                      >
                        {result.filePath}:{result.startLine}-{result.endLine}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div
                        style={{
                          width: "60px",
                          height: "4px",
                          backgroundColor: "var(--surface-elevated)",
                          borderRadius: "2px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.round(result.score * 100)}%`,
                            height: "100%",
                            backgroundColor:
                              result.score > 0.7
                                ? "var(--positive)"
                                : result.score > 0.4
                                ? "var(--warning)"
                                : "var(--negative)",
                            borderRadius: "2px",
                            transition: "width 300ms ease",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color:
                            result.score > 0.7
                              ? "var(--positive)"
                              : result.score > 0.4
                              ? "var(--warning)"
                              : "var(--text-muted)",
                          minWidth: "36px",
                          textAlign: "right",
                        }}
                      >
                        {(result.score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {result.snippet}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!searching && !searchResults && !searchError && (
          <div
            style={{
              textAlign: "center",
              padding: "32px",
              color: "var(--text-muted)",
            }}
          >
            <Sparkles style={{ width: "32px", height: "32px", margin: "0 auto 8px", opacity: 0.3 }} />
            <p style={{ fontSize: "13px" }}>
              Escribe una consulta y pulsa Buscar para explorar la memoria semánticamente
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card Component ─────────────────────────────────────────────────────

function StatCard({
  icon,
  iconColor,
  title,
  value,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>{title}</span>
        <div style={{ color: iconColor }}>{icon}</div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "20px",
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.5px",
        }}
      >
        {value}
      </div>
    </div>
  );
}
