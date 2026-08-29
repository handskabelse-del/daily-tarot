import type { APIRoute } from 'astro';
import { gitCommitAndPush, gitStatus } from '../../../lib/admin-server';

export const prerender = false;

// GET /api/admin/publish — returns current git status so the UI can show
// a "clean / ahead N / behind N" indicator next to the Publish button.
export const GET: APIRoute = async () => {
  try {
    const status = await gitStatus();
    return new Response(JSON.stringify({ ok: true, status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST /api/admin/publish
// body: { files: string[], message: string, push?: boolean }
//   - files:    repo-relative paths to stage (e.g. "src/content/blog/foo.md")
//   - message:  commit message
//   - push:     default true; set false for "commit only" workflows
// Returns: { ok, ...GitPublishResult } with HTTP 200 on success or 4xx/5xx
// on failure. The committedFiles / commitSha fields are always populated if
// the commit succeeded, even if the push then failed.
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const files = Array.isArray(body?.files) ? body.files.map((s: any) => String(s)).filter(Boolean) : [];
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const push = body?.push !== false;

    if (!files.length) {
      return new Response(JSON.stringify({ ok: false, error: 'No files specified' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!message) {
      return new Response(JSON.stringify({ ok: false, error: 'Commit message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await gitCommitAndPush({ files, message, push });

    return new Response(JSON.stringify(result), {
      // Even when ok=false we return 200 with a JSON body so the client
      // gets the structured error message; only use a non-200 status for
      // truly fatal errors (caught by the catch below).
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};