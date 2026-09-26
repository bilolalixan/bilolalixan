// Tiny GitHub REST client: read a file and write several files in one commit.
// Needs GITHUB_TOKEN (fine-grained, Contents: read & write on this repo).

const API = 'https://api.github.com';

function cfg() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'bilolalixan/bilolalixan';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  return { token, repo, branch };
}

async function gh(path, { method = 'GET', body } = {}) {
  const { token } = cfg();
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'apelsin-blog-bot',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${data.message || ''}`.trim());
  return data;
}

/** Returns the file's UTF-8 text, or null if it does not exist. */
async function readFile(path) {
  const { repo, branch } = cfg();
  const data = await gh(`/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  if (!data) return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

async function exists(path) {
  const { repo, branch } = cfg();
  return !!(await gh(`/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`));
}

/**
 * Commit several changes at once.
 * @param {Array<{path:string, text?:string, base64?:string, delete?:boolean}>} changes
 * @param {string} message
 */
async function commit(changes, message) {
  const { repo, branch } = cfg();
  const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const head = await gh(`/repos/${repo}/git/commits/${headSha}`);

  const tree = [];
  for (const c of changes) {
    if (c.delete) { tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await gh(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: c.base64 != null ? { content: c.base64, encoding: 'base64' } : { content: c.text, encoding: 'utf-8' },
    });
    tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh(`/repos/${repo}/git/trees`, { method: 'POST', body: { base_tree: head.tree.sha, tree } });
  const newCommit = await gh(`/repos/${repo}/git/commits`, { method: 'POST', body: { message, tree: newTree.sha, parents: [headSha] } });
  await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: newCommit.sha } });
  return newCommit.sha;
}

module.exports = { readFile, exists, commit };
