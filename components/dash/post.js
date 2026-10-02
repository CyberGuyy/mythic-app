// The one way a Dash client component talks to /api/dash/* (a copy of
// components/simple/post.js). Resolves the JSON body on success; throws the
// route's own error line otherwise, so a button can show it under itself.
export default async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || 'That did not work');
  return data;
}
