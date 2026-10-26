import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { boardProjects, formatList, localClones, parseGithubRemote, summarize } from "./github-projects.mjs";

test("github remotes in every form; other hosts are not projects", () => {
  for (const url of ["https://github.com/acme/web.git", "https://github.com/acme/web", "git@github.com:acme/web.git", "ssh://git@github.com/acme/web.git", "https://github.com/acme/web/"]) {
    assert.equal(parseGithubRemote(url), "acme/web", url);
  }
  assert.equal(parseGithubRemote("https://gitlab.com/acme/web.git"), null);
});

test("projects already on the board and clones on this Mac are found by owner/name", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "chomp-setup-"));
  mkdirSync(path.join(root, "profiles"));
  writeFileSync(path.join(root, "profiles", "acme-web.yaml"), "name: acme-web\ngithub: Acme/Web\n");
  writeFileSync(path.join(root, "profiles", "sketch.yaml"), "name: sketch\n"); // design only
  writeFileSync(path.join(root, "profiles", "broken.yaml"), "name: [\n");
  assert.deepEqual(boardProjects(root), { "acme/web": "acme-web" });

  const code = path.join(root, "code");
  mkdirSync(path.join(code, "web", ".git"), { recursive: true });
  writeFileSync(path.join(code, "web", ".git", "config"), '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:Acme/Web.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
  mkdirSync(path.join(code, "notes"));
  assert.deepEqual(localClones([code, path.join(root, "missing")]), { "acme/web": path.join(code, "web") });
});

test("the picker: archived and duplicate projects dropped, newest first, push access and board state shown", () => {
  const repos = [
    { full_name: "acme/old", pushed_at: "2026-01-01T00:00:00Z", permissions: { push: true } },
    { full_name: "acme/web", description: "The web app", pushed_at: "2026-10-20T00:00:00Z", permissions: { push: true }, default_branch: "develop" },
    { full_name: "acme/web", pushed_at: "2026-10-20T00:00:00Z", permissions: { push: true } },
    { full_name: "other/lib", pushed_at: "2026-10-10T00:00:00Z", permissions: { pull: true } },
    { full_name: "acme/gone", archived: true, pushed_at: "2026-10-21T00:00:00Z", permissions: { push: true } },
  ];
  const projects = summarize(repos, { onBoard: { "acme/old": "acme-old" }, clones: { "acme/web": path.join(os.homedir(), "code", "web") } });
  assert.deepEqual(projects.map((p) => p.github), ["acme/web", "other/lib", "acme/old"]);
  assert.equal(projects[0].default_branch, "develop");
  assert.equal(projects[1].can_push, false);

  const list = formatList(projects, Date.parse("2026-10-22T00:00:00Z"));
  assert.equal(list, [
    "1. acme/web — The web app · updated 2d ago · on this Mac: ~/code/web",
    "2. other/lib · updated 12d ago · read only, no pull requests",
    "",
    "Already on the board:",
    "   acme/old (profiles/acme-old.yaml)",
  ].join("\n"));
});
