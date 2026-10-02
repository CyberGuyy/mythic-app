'use client';
// The sign-in page, shown only when MYTHIC_PASSWORD is set.
import { useState } from 'react';
import post from './dash/post.js';

export default function Login({ next }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await post('/api/login', { password: value }); window.location.assign(next); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <div className="dash-root wl-root" data-theme="yoru">
    <div className="dash-wrap wl-wrap">
      <nav className="dash-nav"><span className="dash-mark"><i aria-hidden="true" />Mythic<em lang="ja">夜</em></span></nav>
      <form className="panel wl-step lg-form" onSubmit={submit}>
        <h2>Sign in</h2>
        <label className="wl-field"><span>Password</span>
          <input type="password" value={value} onChange={event => setValue(event.target.value)} autoComplete="current-password" autoFocus required />
        </label>
        {error && <p className="cmp-err" role="alert">{error}</p>}
        <div className="wl-foot"><span /><button type="submit" className="btn" disabled={busy || !value}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
      </form>
    </div>
  </div>;
}
