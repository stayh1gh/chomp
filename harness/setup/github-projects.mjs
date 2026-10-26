#!/usr/bin/env node
/**
 * Lists the GitHub projects this Mac's GitHub login can reach, for the setup skill's project
 * picker (.claude/skills/setup-chomp). Uses `gh`, so the person signs in once with
 * `gh auth login` and nobody handles a token.
 *
 *   node harness/setup/github-projects.mjs          # numbered list, most recently updated first
 *   node harness/setup/github-projects.mjs --json   # the same, as JSON
 *
 * Each project says whether this login can push to it (the builder needs that to open draft
 * PRs), whether it's already on the board (a profiles/*.yaml with that `github`), and where
 * it's cloned on this Mac, if it is. Archived projects are left out. Projects of an org that
 * hasn't approved GitHub CLI don't show up at all: paste their link instead.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Where people usually keep their code; the skill looks in the same places. */
export const CODE_DIRS = ["code", "Developer", "Projects", "GitHub", "src", "dev"].map((d) => path.join(os.homedir(), d));

/** "owner/name" from a GitHub remote URL (https, ssh or scp-style), else null. */
export function parseGithubRemote(url) {
  const m = String(url).trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** { "owner/name" (lowercase): profile name } for every project already on the board. */
export function boardProjects(root = ROOT) {
  const dir = path.join(root, "profiles");
  if (!existsSync(dir)) return {};
  const out = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
    try {
      const github = loadYaml(readFileSync(path.join(dir, f), "utf8"))?.github;
      if (typeof github === "string" && github.includes("/")) out[github.toLowerCase()] = f.replace(/\.yaml$/, "");
    } catch {} // a half-written profile shouldn't stop the list
  }
  return out;
}

/** { "owner/name" (lowercase): absolute path } for git checkouts one level inside `dirs`. */
export function localClones(dirs = CODE_DIRS) {
  const out = {};
  for (const dir of dirs) {
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      const config = path.join(dir, name, ".git", "config");
      try { if (!statSync(config).isFile()) continue; } catch { continue; }
      const origin = readFileSync(config, "utf8").match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
      const repo = origin && parseGithubRemote(origin[1]);
      if (repo && !out[repo.toLowerCase()]) out[repo.toLowerCase()] = path.join(dir, name);
    }
  }
  return out;
}

/** GitHub's repo objects → what the picker shows, newest first, archived ones dropped. */
export function summarize(repos, { onBoard = {}, clones = {} } = {}) {
  const seen = new Set();
  return repos
    .filter((r) => !r.archived && !seen.has(r.full_name.toLowerCase()) && seen.add(r.full_name.toLowerCase()))
    .map((r) => {
      const key = r.full_name.toLowerCase();
      return {
        github: r.full_name,
        description: r.description || "",
        private: Boolean(r.private),
        can_push: Boolean(r.permissions?.push || r.permissions?.admin || r.permissions?.maintain),
        default_branch: r.default_branch || "main",
        pushed_at: r.pushed_at || null,
        on_board: onBoard[key] ?? null,
        local: clones[key] ?? null,
      };
    })
    .sort((a, b) => String(b.pushed_at).localeCompare(String(a.pushed_at)));
}

const ago = (iso, now = Date.now()) => {
  if (!iso) return "";
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days < 1 ? "updated today" : days < 60 ? `updated ${days}d ago` : `updated ${Math.round(days / 30)}mo ago`;
};

/** The numbered list the skill shows. Projects already on the board are listed last, unnumbered. */
export function formatList(projects, now = Date.now()) {
  const home = os.homedir();
  const line = (p) => [
    p.github,
    p.description && `— ${p.description.length > 70 ? `${p.description.slice(0, 69)}…` : p.description}`,
    `· ${[ago(p.pushed_at, now), !p.can_push && "read only, no pull requests", p.local && `on this Mac: ${p.local.replace(home, "~")}`].filter(Boolean).join(" · ")}`,
  ].filter(Boolean).join(" ");
  const fresh = projects.filter((p) => !p.on_board);
  const added = projects.filter((p) => p.on_board);
  const width = String(fresh.length).length;
  return [
    ...fresh.map((p, i) => `${String(i + 1).padStart(width)}. ${line(p)}`),
    ...(added.length ? ["", "Already on the board:", ...added.map((p) => `   ${p.github} (profiles/${p.on_board}.yaml)`)] : []),
  ].join("\n");
}

function fetchRepos() {
  const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  try {
    gh(["auth", "status", "--hostname", "github.com"]);
  } catch (e) {
    throw new Error(e.code === "ENOENT" ? "GitHub CLI (gh) isn't installed: brew install gh" : "Not signed in to GitHub: run gh auth login (GitHub.com, HTTPS, Login with a web browser)");
  }
  const pages = JSON.parse(gh(["api", "--paginate", "--slurp", "user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member"]));
  return pages.flat();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const projects = summarize(fetchRepos(), { onBoard: boardProjects(), clones: localClones() });
    if (process.argv.includes("--json")) console.log(JSON.stringify(projects, null, 2));
    else console.log(projects.length ? formatList(projects) : "This GitHub login can't see any projects yet.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
