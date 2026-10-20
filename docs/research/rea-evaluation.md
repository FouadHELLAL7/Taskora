# REA ("Reverse Engineer Anything"): evaluation for Taskora

Research date: 2026-10-20. Source: `github.com/morluto/rea`, cloned with `--depth 1` into a scratch directory outside the Taskora tree. HEAD `d532b18` was committed 2026-10-20, and `package.json` reports `rea-agents` **6.7.0**. I read the README, LICENSE, DISCLAIMER.md, SECURITY.md, `docs/installation.md`, `docs/browser-observation.md`, `install.sh` and `package.json`. **I did not install or run anything.**

## What it is

REA is a reverse-engineering toolkit. It ships as an **MCP server and a CLI** (npm package `rea-agents`, binaries `rea` and `rea-agents`) and is built for AI coding agents such as Claude Code, Codex, Cursor and Gemini CLI. Its tagline: "See a feature you like. Understand how it works, down to the binary level." The intended workflow is for an agent to inspect a third-party app "without its source code", explain how a feature works, and then "build a version for your project".

Analysis targets listed in the README:
- native binaries, using Hopper, Ghidra or IDA as the engine
- JavaScript and Electron apps: modules, imports, source maps, routes, IPC
- .NET assemblies
- Android APKs, connected Android devices over adb, and JEB projects
- firmware, packet captures, and HAR/SAZ network captures
- SQLite databases, WASM, EVM bytecode, Go and Rust binaries
- process capture
- **websites**

For websites, REA attaches to a Chrome-family browser over the Chrome DevTools Protocol (CDP). It can capture:
- DOM structure, the accessibility tree and screenshots
- page scripts, which it can export for static analysis, including source maps and "route and endpoint candidates"
- network and console metadata, and storage key names
- WebMCP tool declarations

It can also drive Playwright scenarios. The README says analysis runs locally. Tool results go to the agent, and "its model provider has its own data policy".

Runtime requirement: Node.js 22.x (≥22.19), 24.x (≥24.11) or 26+. Its dependencies include `playwright-core`, `@lydell/node-pty`, `ws`, `isomorphic-git`, `openpgp` and the MCP SDKs. Git submodules pull in jadx-headless-mcp, binwalk, unblob, ghidra-nativeaot and wakaru.

## License

- REA's own code is **MIT** (Copyright 2026 morluto).
- Third-party material keeps its own licenses; see THIRD_PARTY_NOTICES.md. Commercial engines (IDA Pro/Hex-Rays, Hopper, JEB) need the user's own paid license. REA states it grants no tool license.
- DISCLAIMER.md limits intended use to lawful research, education, interoperability, preservation, and analysis of software "you own or are authorized to examine". It explicitly declines to support "copying proprietary software or reproducing its protected code and assets" and "bypassing authentication, bot protection or access controls".

## Install procedure (as documented; not executed)

1. **Agent setup:** `npx rea-agents setup`, or `npx rea-agents@latest setup`. This is an interactive plan-and-approve flow. For Claude Code it writes `mcpServers.rea` into **`~/.claude.json`** and installs a skill into **`~/.claude/skills`**. That makes REA available in **every** project Claude Code opens, not just one. The docs describe isolating it with a separate `CLAUDE_CONFIG_DIR` profile.
2. **CLI only:** `npm install --global rea-agents`, then `rea --help`. For one-off commands, use `npx -y rea-agents@latest <command>`.
3. **Shell installer:** `install.sh` (the `curl … | bash` route). It installs the CLI and then starts `rea setup` interactively unless you pass `--no-setup`.
4. **Optional:** setup can **install Hopper** after a separate approval. On Linux it may call `apt-get`, `dnf` or `pacman` through root or `pkexec`. It can also record paths to an existing Ghidra or Java installation.
5. **Updates:** `rea update`, or re-run `npx rea-agents@latest setup`. The README says REA "changes quickly". The CHANGELOG is about 400 KB and the latest commit is from today.
6. **Removal:** `rea uninstall`, or `rea uninstall --purge-data` to also remove `~/.rea`.

## Security implications

1. **It's not a sandbox.** SECURITY.md says so directly. Runtime workflows run with the user's own permissions: they execute or attach to processes, attach to browsers over CDP, capture traffic and operate on devices. DISCLAIMER.md warns these "can affect application state, files, accounts, devices, and services".
2. **Browser attachment exposes everything in that session.** The website workflow needs a browser started with `--remote-debugging-port`. Any local process can then take full control of that browser. If the page is a logged-in SaaS console such as Action1 or Autotask, the agent, and from there the model provider, receives **real customer data**: hostnames, user names, IPs and tickets. That's exactly what we want to avoid.
3. **Supply chain.** It's a large, very fast-moving npm package with many native and runtime dependencies, installed with `npx …@latest`, plus an optional `curl | bash` installer and an optional system package install. Each update runs new code with full user permissions. The README itself warns about impostor repositories.
4. **Global agent configuration.** The default setup registers the MCP server for all Claude Code projects. Any agent session in any project could then reach the reverse-engineering tools, including through prompt injection from content it reads.
5. **Unverified marketing claims.** The README claims "300,000 GitHub stars". I didn't verify this and it shouldn't count as evidence of maturity or review.
6. **Legal and IP risk for an open-source project.** Taskora is an OSS clone of a commercial PSA. Running a tool designed to pull scripts, routes and source maps out of a competitor's app (Autotask) or a vendor console (Action1), then "build a version for your project", creates a real risk of contaminating Taskora's MIT/OSS codebase with proprietary-derived code. It also risks breaching the vendors' terms. For example, Action1's website Terms of Use prohibit using "any robot, spider, or other automatic device, process, or means" to monitor or copy site material. I didn't review the Action1 or Autotask product subscription agreements, which typically restrict reverse engineering further. REA's own docs recognise the contamination problem: they discuss "clean-room separation" enforced by a separate account or container.

## Is it appropriate for "read-only functional study of a web app"?

**No, not for third-party SaaS apps such as Autotask or Action1, and it isn't needed.**

- REA's web features aren't "functional study" in the sense of observing what a product does. They capture and statically analyse the app's own code (script bundles, source maps, route and endpoint candidates). That's reverse engineering, which is outside what the vendors allow and outside what an OSS project should take in.
- It needs a live, authenticated browser session. In practice that means customer data reaches the agent and the model provider.
- The Action1 integration doesn't need it at all. Action1 publishes an official OpenAPI 3.1 spec and an MIT-licensed vendor PowerShell module. See `action1-api.md`; everything we need is there.

## Recommendation for Taskora development

1. **Don't install REA** on Taskora development machines, and don't register it in the shared or default Claude Code profile. Don't add it to the repo, CI or devcontainer.
2. **Study third-party products only through permitted channels:**
   - official API docs and specs, such as Action1's OpenAPI and Autotask's published REST API docs
   - vendor-published SDKs and modules, after checking their license
   - public user documentation, release notes and marketing material
   - normal manual use of a trial or test tenant, with notes and manual screenshots of **non-customer** data, describing behaviour in our own words
   
   Record behaviour, not code. Never copy vendor JS, CSS, assets or text.
3. **For debugging Taskora's own web UI and network traffic,** use ordinary tools that are already appropriate: browser DevTools, Playwright tests against `localhost`, and HAR files of Taskora itself. REA adds little here.
4. **If someone still wants to try REA for a legitimate case,** such as analysing Taskora's own build artefacts, do it under these conditions:
   - use a disposable VM or container with no access to customer tenants or real credentials
   - use a separate `CLAUDE_CONFIG_DIR` profile, so REA isn't registered globally
   - pin a specific version instead of `@latest`, and review the setup plan before approving
   - don't install Hopper or any other system package
   - never point it at a third-party product without the vendor's written permission
   - keep its output out of the Taskora repo
