"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ColumnPinningState,
  type SortingState,
  type VisibilityState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Eye,
  Gauge,
  LoaderCircle,
  Search,
  Scale,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyForecastCell, ForecastCell } from "./ForecastCell";
import { PlayerIdentity } from "@/components/decision/DecisionPrimitives";
import {
  PlayerComparisonDialog,
  PlayerDetailsDialog,
  TransferAdvisorDialog,
} from "@/components/decision/PlayerDecisionDialogs";
import {
  filterExplorerPlayers,
  mergePlayersWithPredictions,
  updateComparisonSelection,
  type ExplorerFilters,
  type ExplorerPlayer,
  type PlayerApiItem,
  type PlayerPosition,
  type PredictionPayload,
} from "./model";

type Density = "compact" | "comfortable";

interface PlayersResponse {
  success: boolean;
  data?: { items: PlayerApiItem[]; total: number };
  error?: string;
}

interface PredictionsResponse {
  gameweeks?: number[];
  predictions?: PredictionPayload[];
}

const columnHelper = createColumnHelper<ExplorerPlayer>();
const pinnedColumns: ColumnPinningState = { left: ["player", "team"] };

const positionOptions: Array<{ value: PlayerPosition | "ALL"; label: string }> =
  [
    { value: "ALL", label: "All positions" },
    { value: "GOALKEEPER", label: "Goalkeepers" },
    { value: "DEFENDER", label: "Defenders" },
    { value: "MIDFIELDER", label: "Midfielders" },
    { value: "FORWARD", label: "Forwards" },
  ];

function columnPinStyles(
  column: {
    getIsPinned: () => false | "left" | "right";
    getStart: (position: "left") => number;
  },
  header = false,
): CSSProperties {
  const pinned = column.getIsPinned();
  return {
    left: pinned === "left" ? `${column.getStart("left")}px` : undefined,
    position: pinned ? "sticky" : "relative",
    zIndex: pinned ? (header ? 30 : 10) : header ? 20 : 0,
  };
}

export function PlayerExplorer() {
  const [players, setPlayers] = useState<ExplorerPlayer[]>([]);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("compact");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "forecastTotal", desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    ownership: false,
    form: false,
  });
  const [filters, setFilters] = useState<ExplorerFilters>({
    query: "",
    position: "ALL",
    team: "ALL",
    availability: "ALL",
  });
  const [selectedPlayers, setSelectedPlayers] = useState<ExplorerPlayer[]>([]);
  const [detailPlayer, setDetailPlayer] = useState<ExplorerPlayer | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryApplied = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [playersResult, predictionsResult] = await Promise.allSettled([
          fetch("/api/players?page=1&pageSize=1000&details=true").then(
            async (response) => {
              const payload = (await response.json()) as PlayersResponse;
              if (!response.ok || !payload.success || !payload.data) {
                throw new Error(
                  payload.error ?? "Could not load player roster",
                );
              }
              return payload.data.items;
            },
          ),
          fetch("/api/predictions?range=5").then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as PredictionsResponse;
          }),
        ]);

        if (!active) return;
        if (playersResult.status === "rejected") {
          throw playersResult.reason;
        }

        const predictionPayload =
          predictionsResult.status === "fulfilled"
            ? predictionsResult.value
            : null;
        setPlayers(
          mergePlayersWithPredictions(
            playersResult.value,
            predictionPayload?.predictions ?? [],
          ),
        );
        setGameweeks(predictionPayload?.gameweeks ?? []);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load Player Explorer",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (queryApplied.current || !players.length) return;
    queryApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const requestedIds = [params.get("out"), params.get("in")]
      .map(Number)
      .filter((id) => Number.isFinite(id));
    const requestedPlayers = requestedIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player): player is ExplorerPlayer => player != null);
    if (requestedPlayers.length >= 2) {
      setSelectedPlayers(requestedPlayers.slice(0, 3));
      setTransferOpen(true);
    }
  }, [players]);

  const toggleComparison = useCallback((player: ExplorerPlayer) => {
    setSelectedPlayers((current) => updateComparisonSelection(current, player));
  }, []);

  const showDetails = useCallback((player: ExplorerPlayer) => {
    setDetailPlayer(player);
    setDetailsOpen(true);
  }, []);

  const teams = useMemo(
    () =>
      Array.from(
        new Map(
          players.map((player) => [player.team.shortName, player.team.name]),
        ),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [players],
  );

  const filteredResult = useMemo(() => {
    const started = typeof performance === "undefined" ? 0 : performance.now();
    const rows = filterExplorerPlayers(players, filters);
    return {
      rows,
      duration:
        typeof performance === "undefined" ? 0 : performance.now() - started,
    };
  }, [filters, players]);

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("webName", {
        id: "player",
        header: "Player",
        size: 220,
        enableHiding: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="min-w-0 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => showDetails(row.original)}
            aria-label={`Open details for ${row.original.webName}`}
          >
            <PlayerIdentity player={row.original} compact />
          </button>
        ),
      }),
      columnHelper.accessor((row) => row.team.shortName, {
        id: "team",
        header: "Team",
        size: 86,
        enableHiding: false,
        cell: ({ getValue, row }) => (
          <span title={row.original.team.name} className="font-semibold">
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("nowCost", {
        id: "price",
        header: "Price",
        size: 82,
        cell: ({ getValue }) => (
          <span className="fpl-data">£{(getValue() / 10).toFixed(1)}</span>
        ),
      }),
      columnHelper.accessor("totalPoints", {
        id: "points",
        header: "Points",
        size: 82,
        cell: ({ getValue }) => <span className="fpl-data">{getValue()}</span>,
      }),
      columnHelper.accessor("pointsPerGame", {
        id: "ppg",
        header: "PPG",
        size: 76,
        cell: ({ getValue }) => (
          <span className="fpl-data">{getValue().toFixed(1)}</span>
        ),
      }),
      columnHelper.accessor("selectedBy", {
        id: "ownership",
        header: "Owned",
        size: 86,
        cell: ({ getValue }) => (
          <span className="fpl-data">{getValue().toFixed(1)}%</span>
        ),
      }),
      columnHelper.accessor("form", {
        id: "form",
        header: "Form",
        size: 76,
        cell: ({ getValue }) => (
          <span className="fpl-data">{getValue().toFixed(1)}</span>
        ),
      }),
      columnHelper.accessor("forecastTotal", {
        id: "forecastTotal",
        header: gameweeks.length ? `${gameweeks.length} GW xPts` : "Next xPts",
        size: 104,
        sortUndefined: "last",
        cell: ({ getValue }) => {
          const value = getValue();
          return value == null ? (
            <EmptyForecastCell />
          ) : (
            <span className="fpl-data font-black text-forecast">
              {value.toFixed(1)}
            </span>
          );
        },
      }),
    ];

    const forecastColumns = gameweeks.map((gameweek) =>
      columnHelper.accessor((row) => row.forecasts[gameweek]?.xPts, {
        id: `gw-${gameweek}`,
        header: `GW${gameweek}`,
        size: 86,
        sortUndefined: "last",
        cell: ({ row }) => (
          <ForecastCell
            forecast={row.original.forecasts[gameweek]}
            gameweek={gameweek}
          />
        ),
      }),
    );

    const decisionColumn = columnHelper.display({
      id: "actions",
      header: "Decide",
      size: 84,
      enableHiding: false,
      cell: ({ row }) => {
        const selected = selectedPlayers.some(
          (player) => player.id === row.original.id,
        );
        return (
          <div className="flex w-full items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => showDetails(row.original)}
              aria-label={`Open details for ${row.original.webName}`}
            >
              <Eye aria-hidden="true" />
            </Button>
            <Button
              variant={selected ? "secondary" : "ghost"}
              size="icon-xs"
              onClick={() => toggleComparison(row.original)}
              disabled={!selected && selectedPlayers.length >= 3}
              aria-label={
                selected
                  ? `Remove ${row.original.webName} from comparison`
                  : `Add ${row.original.webName} to comparison`
              }
              aria-pressed={selected}
            >
              <Scale aria-hidden="true" />
            </Button>
          </div>
        );
      },
    });

    return [...base, ...forecastColumns, decisionColumn];
  }, [gameweeks, selectedPlayers, showDetails, toggleComparison]);

  const table = useReactTable({
    data: filteredResult.rows,
    columns,
    state: { sorting, columnVisibility, columnPinning: pinnedColumns },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnPinning: false,
  });

  const rows = table.getRowModel().rows;
  const rowHeight = density === "compact" ? 42 : 54;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  const virtualRows = virtualizer.getVirtualItems();

  const updateFilter = <Key extends keyof ExplorerFilters>(
    key: Key,
    value: ExplorerFilters[Key],
  ) => setFilters((current) => ({ ...current, [key]: value }));

  if (loading) {
    return (
      <div className="grid min-h-[32rem] place-items-center border border-border bg-card">
        <div className="text-center">
          <LoaderCircle
            className="mx-auto mb-3 size-6 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="text-sm font-bold">Loading canonical roster</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Joining forecasts only where verified fixtures exist.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-64 items-center gap-4 border border-risk/40 bg-risk/5 p-6">
        <ShieldAlert className="size-6 shrink-0 text-risk" aria-hidden="true" />
        <div>
          <p className="font-bold">Player roster unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="player-explorer-title" data-density={density}>
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">UI0.3 prototype</Badge>
            <span className="text-xs font-semibold text-stale">
              2026/27 roster pending · 2025/26 evidence frozen
            </span>
          </div>
          <h1
            id="player-explorer-title"
            className="text-3xl font-black tracking-[-0.035em] sm:text-4xl"
          >
            Player Explorer
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Scan the complete player pool, then narrow the decision set without
            losing data provenance or forecast confidence.
          </p>
        </div>
        <dl className="grid grid-cols-3 border border-border bg-card text-right">
          <div className="border-r border-border px-3 py-2">
            <dt className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              Roster
            </dt>
            <dd className="fpl-data mt-0.5 text-lg font-black">
              {players.length}
            </dd>
          </div>
          <div className="border-r border-border px-3 py-2">
            <dt className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              Visible
            </dt>
            <dd className="fpl-data mt-0.5 text-lg font-black">
              {rows.length}
            </dd>
          </div>
          <div className="px-3 py-2">
            <dt className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              Filter
            </dt>
            <dd className="fpl-data mt-0.5 text-lg font-black">
              {filteredResult.duration.toFixed(1)}ms
            </dd>
          </div>
        </dl>
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3 xl:flex-row xl:items-center">
          <label className="relative min-w-64 flex-1 xl:max-w-sm">
            <span className="sr-only">Search players or teams</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="Search player or team"
              className="pl-8"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.position}
              onValueChange={(value) =>
                updateFilter("position", value as ExplorerFilters["position"])
              }
            >
              <SelectTrigger aria-label="Filter by position" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.team}
              onValueChange={(value) => updateFilter("team", value)}
            >
              <SelectTrigger aria-label="Filter by team" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All teams</SelectItem>
                {teams.map(([shortName, name]) => (
                  <SelectItem key={shortName} value={shortName}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.availability}
              onValueChange={(value) =>
                updateFilter(
                  "availability",
                  value as ExplorerFilters["availability"],
                )
              }
            >
              <SelectTrigger
                aria-label="Filter by availability"
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any status</SelectItem>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="DOUBT">Flagged</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={density}
              onValueChange={(value) => setDensity(value as Density)}
            >
              <SelectTrigger aria-label="Table density" className="w-32">
                <Gauge className="size-3.5" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>
                <Columns3 data-icon="inline-start" aria-hidden="true" />
                Columns
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52">
                <PopoverHeader>
                  <PopoverTitle>Visible columns</PopoverTitle>
                </PopoverHeader>
                <div className="space-y-1">
                  {table
                    .getAllLeafColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <label
                        key={column.id}
                        className="flex min-h-8 cursor-pointer items-center gap-2 px-1 hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            column.toggleVisibility(event.target.checked)
                          }
                          className="accent-primary"
                        />
                        <span>
                          {column.id.replace("forecastTotal", "Next xPts")}
                        </span>
                      </label>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {!gameweeks.length && (
          <div className="flex items-center gap-2 border-b border-border bg-uncertainty/8 px-3 py-2 text-xs text-muted-foreground">
            <ShieldAlert
              className="size-4 text-uncertainty"
              aria-hidden="true"
            />
            <span>
              Official 2026/27 fixtures are not available. Forecast columns stay
              empty instead of reusing stale gameweeks.
            </span>
          </div>
        )}

        {selectedPlayers.length > 0 && (
          <div className="flex flex-col justify-between gap-3 border-b border-border bg-forecast/5 px-3 py-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                Decision set {selectedPlayers.length}/3
              </span>
              {selectedPlayers.map((player) => (
                <span
                  key={player.id}
                  className="inline-flex items-center gap-1 border border-border bg-card px-2 py-1 text-xs font-bold"
                >
                  {player.webName}
                  <button
                    type="button"
                    onClick={() => toggleComparison(player)}
                    className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Remove ${player.webName} from decision set`}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedPlayers([])}
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedPlayers.length < 2}
                onClick={() => setCompareOpen(true)}
              >
                <Scale aria-hidden="true" />
                Compare
              </Button>
              <Button
                size="sm"
                disabled={selectedPlayers.length < 2}
                onClick={() => setTransferOpen(true)}
              >
                Transfer
              </Button>
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          className="relative h-[min(65dvh,44rem)] overflow-auto"
          role="region"
          aria-label="Scrollable player table"
          tabIndex={0}
        >
          <table
            className="relative grid border-collapse text-xs"
            style={{ minWidth: table.getTotalSize() }}
          >
            <thead className="sticky top-0 z-20 grid border-b border-border bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="flex w-full">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                        }
                        className={cn(
                          "flex h-10 shrink-0 items-center border-r border-border bg-card px-3 text-left text-[10px] font-black tracking-[0.08em] text-muted-foreground uppercase last:border-r-0",
                          header.column.getIsPinned() &&
                            "shadow-[1px_0_0_var(--border)]",
                        )}
                        style={{
                          width: header.getSize(),
                          ...columnPinStyles(header.column, true),
                        }}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-1 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3" aria-hidden="true" />
                            ) : sorted === "desc" ? (
                              <ArrowDown
                                className="size-3"
                                aria-hidden="true"
                              />
                            ) : (
                              <ArrowUpDown
                                className="size-3 opacity-50"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody
              className="relative grid"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <tr
                    key={row.id}
                    data-index={virtualRow.index}
                    ref={(node) => virtualizer.measureElement(node)}
                    className="absolute flex w-full border-b border-border bg-card hover:bg-muted/50"
                    style={{
                      minHeight: rowHeight,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "flex shrink-0 items-center justify-end overflow-hidden border-r border-border bg-inherit px-3 last:border-r-0 first:justify-start",
                          cell.column.getIsPinned() &&
                            "shadow-[1px_0_0_var(--border)]",
                        )}
                        style={{
                          width: cell.column.getSize(),
                          ...columnPinStyles(cell.column),
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!rows.length && (
            <div className="absolute inset-x-0 top-10 grid h-48 place-items-center text-sm text-muted-foreground">
              No players match the current filters.
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center">
          <span>
            Rendering {virtualRows.length} of {rows.length} filtered rows · two
            identity columns pinned
          </span>
          <span className="flex items-center gap-1.5">
            <Gauge className="size-3.5" aria-hidden="true" />
            Virtual window {virtualizer.getTotalSize().toLocaleString()}px
          </span>
        </div>
      </div>

      <PlayerDetailsDialog
        player={detailPlayer}
        gameweeks={gameweeks}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        selected={
          detailPlayer != null &&
          selectedPlayers.some((player) => player.id === detailPlayer.id)
        }
        onToggleCompare={toggleComparison}
      />
      <PlayerComparisonDialog
        players={selectedPlayers}
        open={compareOpen}
        onOpenChange={setCompareOpen}
        onRemove={toggleComparison}
        onStartTransfer={() => {
          setCompareOpen(false);
          setTransferOpen(true);
        }}
      />
      <TransferAdvisorDialog
        players={selectedPlayers}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
    </section>
  );
}
