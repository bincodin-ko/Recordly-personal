// One headless check: tsc, biome lint (baseline), i18n, vitest (known failures), Playwright UI.
// Output: .verify/summary.md, .verify/logs/*.log, .verify/screens/*.png. Exit 1 on any failure.
// Parallel-safe: VERIFY_PORT or a free port (see playwright.config.ts); everything stays in this worktree.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".verify");
const logs = path.join(out, "logs");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "scripts", "verify-baseline.json"), "utf8"));
fs.rmSync(path.join(out, "screens"), { recursive: true, force: true });
fs.mkdirSync(logs, { recursive: true });
fs.mkdirSync(path.join(out, "screens"), { recursive: true });

const bin = (p) => path.join(root, "node_modules", p);
const results = [];

function run(name, args, env = {}) {
	const started = Date.now();
	process.stdout.write(`verify: ${name} ... `);
	const r = spawnSync(process.execPath, args, {
		cwd: root,
		env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...env },
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
	const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
	fs.writeFileSync(path.join(logs, `${name}.log`), text);
	return { code: r.status, text, seconds: Math.round((Date.now() - started) / 1000) };
}

function record(step, ok, counts, reason, seconds) {
	results.push({ step, ok, counts, reason, seconds });
	console.log(`${ok ? "PASS" : "FAIL"} (${seconds}s) ${counts}${reason ? ` - ${reason}` : ""}`);
}

// 1. TypeScript
{
	const r = run("tsc", [bin("typescript/bin/tsc"), "--noEmit"]);
	const errors = (r.text.match(/error TS\d+/g) ?? []).length;
	record("tsc --noEmit", r.code === 0, `${errors} errors`, r.code === 0 ? "" : "see logs/tsc.log", r.seconds);
}

// 2. Biome lint: fail only when counts rise above the stored baseline.
{
	const r = run("lint", [bin("@biomejs/biome/bin/biome"), "lint", ".", "--max-diagnostics=0"]);
	const errors = Number(r.text.match(/Found (\d+) error/)?.[1] ?? 0);
	const warnings = Number(r.text.match(/Found (\d+) warning/)?.[1] ?? 0);
	const ok = errors <= baseline.lint.errors && warnings <= baseline.lint.warnings;
	record(
		"biome lint",
		ok,
		`${errors} errors / ${warnings} warnings (baseline ${baseline.lint.errors}/${baseline.lint.warnings})`,
		ok ? "" : "lint count above baseline, see logs/lint.log",
		r.seconds,
	);
}

// 3. i18n structure
{
	const r = run("i18n", ["scripts/i18n-check.mjs"]);
	record("i18n:check", r.code === 0, r.code === 0 ? "consistent" : "-", r.code === 0 ? "" : "see logs/i18n.log", r.seconds);
}

// 4. Vitest: only files outside the accepted baseline may not fail.
{
	const json = path.join(out, "vitest.json");
	fs.rmSync(json, { force: true });
	const r = run("vitest", [bin("vitest/vitest.mjs"), "--run", "--reporter=json", `--outputFile=${json}`]);
	let ok = false;
	let counts = "no report";
	let reason = "vitest did not write a report, see logs/vitest.log";
	if (fs.existsSync(json)) {
		const report = JSON.parse(fs.readFileSync(json, "utf8"));
		const failedFiles = report.testResults
			.filter((f) => f.status !== "passed")
			.map((f) => path.relative(root, f.name).replaceAll("\\", "/"));
		const unexpected = failedFiles.filter((f) => !baseline.vitestKnownFailingFiles.includes(f));
		ok = unexpected.length === 0;
		counts = `${report.numPassedTests}/${report.numTotalTests} tests, ${failedFiles.length} files failed (${failedFiles.length - unexpected.length} known)`;
		reason = ok ? "" : `new failures: ${unexpected.join(", ")}`;
	}
	record("vitest", ok, counts, reason, r.seconds);
}

// 5. Playwright UI (renderer-only, headless) incl. verify-screens.spec.ts screenshots.
{
	const json = path.join(out, "playwright.json");
	fs.rmSync(json, { force: true });
	const r = run(
		"playwright",
		[bin("@playwright/test/cli.js"), "test", "--reporter=line,json", "--output=.verify/test-results"],
		{ PLAYWRIGHT_JSON_OUTPUT_NAME: json, VERIFY_SCREENS_DIR: path.join(out, "screens") },
	);
	let counts = "no report";
	let reason = r.code === 0 ? "" : "see logs/playwright.log";
	if (fs.existsSync(json)) {
		const s = JSON.parse(fs.readFileSync(json, "utf8")).stats;
		counts = `${s.expected} passed, ${s.unexpected} failed, ${s.flaky} flaky, ${s.skipped} skipped`;
		const failed = [...r.text.matchAll(/^\s+(tests[\\/]ui[\\/]\S+:\d+:\d+ › .+?)\s*─*$/gm)].map((m) => m[1]);
		if (failed.length) reason = `failed: ${failed.slice(0, 10).join("; ")}`;
	}
	const shots = fs.readdirSync(path.join(out, "screens")).filter((f) => f.endsWith(".png")).length;
	record("playwright UI", r.code === 0, `${counts}; ${shots} screenshots`, reason, r.seconds);
}

const allOk = results.every((r) => r.ok);
const md = [
	`# verify ${allOk ? "PASS" : "FAIL"} - ${new Date().toISOString()}`,
	"",
	"| step | result | counts | reason | sec |",
	"| --- | --- | --- | --- | --- |",
	...results.map(
		(r) => `| ${r.step} | ${r.ok ? "pass" : "FAIL"} | ${r.counts} | ${r.reason.replaceAll("|", "/")} | ${r.seconds} |`,
	),
	"",
	"Logs: .verify/logs/. Screenshots: .verify/screens/.",
	"",
].join("\n");
fs.writeFileSync(path.join(out, "summary.md"), md);
console.log(`\n${md}`);
process.exit(allOk ? 0 : 1);
