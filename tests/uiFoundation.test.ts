import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = process.cwd();

test("new UI tokens cover analytical meaning, density and motion", () => {
  const css = readFileSync(`${root}/styles/fpl-ui.css`, "utf8");
  for (const token of [
    "--fact:",
    "--forecast:",
    "--uncertainty:",
    "--risk:",
    "--positive-delta:",
    "--negative-delta:",
    "--fresh:",
    "--stale:",
    "--fpl-row-height:",
    "--fpl-motion-standard:",
  ]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-density="compact"/);
  assert.match(css, /data-density="comfortable"/);
});

test("component registry targets the canonical Base UI surface", () => {
  const config = JSON.parse(
    readFileSync(`${root}/components.json`, "utf8"),
  ) as {
    style: string;
    aliases: { ui: string };
  };
  assert.match(config.style, /^base-/);
  assert.equal(config.aliases.ui, "@/components/ui");
});

test("legacy Radix packages are absent from the UI dependency contract", () => {
  const packageJson = JSON.parse(
    readFileSync(`${root}/package.json`, "utf8"),
  ) as { dependencies: Record<string, string> };
  assert.equal(packageJson.dependencies["@base-ui/react"], "^1.6.0");
  assert.deepEqual(
    Object.keys(packageJson.dependencies).filter((name) =>
      name.startsWith("@radix-ui/"),
    ),
    [],
  );
});

test("legacy UI source and temporary v2 split are fully removed", () => {
  assert.equal(existsSync(`${root}/components/v2`), false);
  assert.equal(existsSync(`${root}/components/layout/Sidebar.tsx`), false);

  const uiFiles = readdirSync(`${root}/components/ui`).filter((file) =>
    file.endsWith(".tsx"),
  );
  assert.ok(uiFiles.length > 0);
  for (const file of uiFiles) {
    const source = readFileSync(`${root}/components/ui/${file}`, "utf8");
    assert.doesNotMatch(source, /@radix-ui\//);
  }
});

test("Player Explorer uses the canonical TanStack virtual table", () => {
  const source = readFileSync(
    `${root}/components/player-explorer/PlayerExplorer.tsx`,
    "utf8",
  );
  assert.match(source, /useReactTable/);
  assert.match(source, /useVirtualizer/);
  assert.match(source, /<table/);
  assert.match(source, /columnPinning: pinnedColumns/);
  assert.doesNotMatch(source, /(?:bg|text|border)-(?:slate|emerald|teal)-/);
});

test("My Team has one responsive product-owned squad surface", () => {
  const source = readFileSync(
    `${root}/components/my-team/MyTeamWorkspace.tsx`,
    "utf8",
  );
  assert.match(source, /DesktopPitch/);
  assert.match(source, /MobileSquadList/);
  assert.match(source, /Captaincy/);
  assert.match(source, /Transfer signal/);
  assert.doesNotMatch(source, /(?:bg|text|border)-(?:slate|emerald|teal)-/);
  assert.equal(existsSync(`${root}/components/personal`), false);
});

test("UI0.5 decision flows share semantic analytical primitives", () => {
  const explorer = readFileSync(
    `${root}/components/player-explorer/PlayerExplorer.tsx`,
    "utf8",
  );
  const dialogs = readFileSync(
    `${root}/components/decision/PlayerDecisionDialogs.tsx`,
    "utf8",
  );
  const primitives = readFileSync(
    `${root}/components/decision/DecisionPrimitives.tsx`,
    "utf8",
  );
  assert.match(explorer, /PlayerDetailsDialog/);
  assert.match(explorer, /PlayerComparisonDialog/);
  assert.match(explorer, /TransferAdvisorDialog/);
  assert.match(dialogs, /evaluateTransfer/);
  for (const component of [
    "PlayerIdentity",
    "MetricBlock",
    "ConfidenceState",
    "FreshnessState",
  ]) {
    assert.match(primitives, new RegExp(`export function ${component}`));
  }
  assert.doesNotMatch(
    `${explorer}${dialogs}${primitives}`,
    /(?:bg|text|border)-(?:slate|emerald|teal)-/,
  );
});

test("UI0.6 replaces legacy chat and settings with semantic workspaces", () => {
  const chat = readFileSync(`${root}/app/chat/page.tsx`, "utf8");
  const assistant = readFileSync(
    `${root}/components/assistant/StructuredAssistantMessage.tsx`,
    "utf8",
  );
  const settings = readFileSync(
    `${root}/components/settings/SettingsWorkspace.tsx`,
    "utf8",
  );
  const shell = readFileSync(`${root}/components/layout/AppShell.tsx`, "utf8");

  assert.match(chat, /StructuredAssistantMessage/);
  assert.match(assistant, /MetricBlock/);
  assert.match(assistant, /FreshnessState/);
  assert.match(settings, /Stored squad available/);
  assert.match(settings, /Try live sync/);
  assert.match(settings, /Information density/);
  assert.match(settings, /2026\/27 official feed/);
  assert.match(shell, /data-density=\{density\}/);
  assert.doesNotMatch(
    `${chat}${assistant}${settings}`,
    /(?:bg|text|border)-(?:slate|emerald|teal)-/,
  );
});
