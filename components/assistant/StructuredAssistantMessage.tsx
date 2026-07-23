import { Bot, Database, ShieldAlert, Sparkles } from "lucide-react";
import {
  MetricBlock,
  FreshnessState,
} from "@/components/decision/DecisionPrimitives";
import {
  assistantPlayers,
  isAssistantComparison,
  toolLabel,
  visibleComparisonMetrics,
  type AssistantEvidenceItem,
  type AssistantPlayerFact,
} from "./model";

function PlayerFactCard({ player }: { player: AssistantPlayerFact }) {
  return (
    <article className="border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{player.webName}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {player.team} · {player.position} ·{" "}
            {player.isInjured ? "Flagged" : "Available"}
          </p>
        </div>
        <FreshnessState status="frozen" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <MetricBlock label="Price" value={`£${player.price.toFixed(1)}m`} />
        <MetricBlock label="Form" value={player.form.toFixed(1)} />
        <MetricBlock label="Owned" value={`${player.ownership.toFixed(1)}%`} />
      </dl>
    </article>
  );
}

function EvidenceBlock({ item }: { item: AssistantEvidenceItem }) {
  if (isAssistantComparison(item.result)) {
    const comparison = item.result;
    return (
      <div className="border-t border-border pt-4">
        <p className="mb-3 text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
          {toolLabel(item.tool)}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PlayerFactCard player={comparison.player1} />
          <PlayerFactCard player={comparison.player2} />
        </div>
        <div className="mt-3 overflow-x-auto border border-border">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="bg-muted/50 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Fact</th>
                <th className="px-3 py-2">{comparison.player1.webName}</th>
                <th className="px-3 py-2">{comparison.player2.webName}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleComparisonMetrics(comparison).map((metric) => (
                <tr key={metric.metric}>
                  <th className="px-3 py-2 font-bold">{metric.metric}</th>
                  <td className="fpl-data px-3 py-2">{metric.player1Value}</td>
                  <td className="fpl-data px-3 py-2">{metric.player2Value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const players = assistantPlayers(item.result);
  if (players.length > 0) {
    return (
      <div className="border-t border-border pt-4">
        <p className="mb-3 text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
          {toolLabel(item.tool)} · {players.length} record
          {players.length === 1 ? "" : "s"}
        </p>
        <div className="grid gap-3 xl:grid-cols-2">
          {players.map((player) => (
            <PlayerFactCard key={player.id} player={player} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-xs">
      <span className="flex items-center gap-2 font-bold">
        <Database className="size-4 text-muted-foreground" aria-hidden="true" />
        {toolLabel(item.tool)}
      </span>
      <FreshnessState status="frozen" />
    </div>
  );
}

export function StructuredAssistantMessage({
  content,
  evidence,
}: {
  content: string;
  evidence: AssistantEvidenceItem[];
}) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <article className="overflow-hidden border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-black">
          <Bot className="size-4" aria-hidden="true" />
          Assistant analysis
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-forecast">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Structured answer
        </span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-3 text-sm leading-6">
          {paragraphs.map((paragraph, index) => (
            <p
              key={`${index}-${paragraph.slice(0, 20)}`}
              className="whitespace-pre-wrap"
            >
              {paragraph}
            </p>
          ))}
        </div>
        {evidence.length > 0 && (
          <div className="space-y-4 pt-1">
            {evidence.map((item, index) => (
              <EvidenceBlock key={`${item.tool}-${index}`} item={item} />
            ))}
          </div>
        )}
        <div className="flex items-start gap-2 border border-uncertainty/40 bg-uncertainty/5 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
          <ShieldAlert
            className="mt-0.5 size-4 shrink-0 text-uncertainty"
            aria-hidden="true"
          />
          <span>
            2026/27 forecasts remain unavailable until official fixtures pass
            the publication gate. Displayed player metrics are stored facts, not
            a new-season projection.
          </span>
        </div>
      </div>
    </article>
  );
}
