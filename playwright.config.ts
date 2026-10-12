import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

// Parallel-safe port: VERIFY_PORT, else ask the OS for a free one. Stored in env so
// Playwright workers (which re-load this config) inherit the same port.
if (!process.env.VERIFY_PORT) {
	process.env.VERIFY_PORT = execFileSync(process.execPath, [
		"-e",
		"const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})",
	])
		.toString()
		.trim();
}
const port = process.env.VERIFY_PORT;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: "./tests/ui",
	timeout: 30000,
	use: {
		baseURL,
		viewport: { width: 1440, height: 1000 },
		trace: "retain-on-failure",
	},
	webServer: {
		// Per-worktree Vite dep cache: node_modules may be a link shared by several worktrees.
		env: { RECORDLY_RENDERER_ONLY: "1", RECORDLY_VITE_CACHE_DIR: ".verify/vite-cache" },
		command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
		url: baseURL,
		reuseExistingServer: false,
	},
});
