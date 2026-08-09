import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();

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
