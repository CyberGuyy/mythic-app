'use client';
// Connections: each connector is a panel with its state, what it does and the
// one or two things you do to connect it. Every change posts to
// /api/connections and refreshes the page.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconBadge } from '../dash/icons.js';
import post from '../dash/post.js';

const when = iso => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

function State({ on, bad, children }) {
  return <span className="cn-state" data-on={on && !bad ? '' : undefined} data-bad={bad ? '' : undefined}><i aria-hidden="true" />{children}</span>;
}

function Panel({ id, icon, title, state, lead, children }) {
  return <section id={id} className="panel cn-sec" aria-labelledby={'cn-' + id}>
    <h2 id={'cn-' + id}><IconBadge name={icon} />{title}<div className="act">{state}</div></h2>
    {lead && <p className="cn-lead">{lead}</p>}
    {children}
  </section>;
}

/** One action at a time, with its error or message under the panel. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [notes, setNotes] = useState({});
  async function run(key, body, { message, after } = {}) {
    setBusy(key); setNotes(current => ({ ...current, [key]: null }));
    try {
      const result = await post('/api/connections', body);
      if (result?.result && result.result.ok === false) setNotes(current => ({ ...current, [key]: { error: result.result.error } }));
      else if (message) setNotes(current => ({ ...current, [key]: { message } }));
      after?.(result);
      router.refresh();
      return result;
    } catch (failure) {
      setNotes(current => ({ ...current, [key]: { error: failure.message } }));
      return null;
    } finally {
      setBusy(null);
    }
  }
  const note = key => notes[key] && <p className={notes[key].error ? 'cn-err' : 'cn-msg'} role={notes[key].error ? 'alert' : 'status'}>{notes[key].error || notes[key].message}</p>;
  return { run, busy, note };
}

function You({ profile, action }) {
  const [name, setName] = useState(profile.name);
  const [timezone, setTimezone] = useState(profile.timezone);
  const zones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [profile.timezone]; } }, [profile.timezone]);
  const changed = name !== profile.name || timezone !== profile.timezone;
  return <Panel id="you" icon="day" title="You" lead="Your name for the greeting, and the timezone your day is counted in.">
    <div className="cn-form">
      <input value={name} onChange={event => setName(event.target.value)} placeholder="Your first name" maxLength={40} aria-label="Name" />
      <select value={timezone} onChange={event => setTimezone(event.target.value)} aria-label="Timezone">
        {(zones.includes(timezone) ? zones : [timezone, ...zones]).map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
      </select>
      <button type="button" className="btn sm" disabled={!changed || action.busy === 'you'} onClick={() => action.run('you', { action: 'profile', name, timezone }, { message: 'Saved.' })}>Save</button>
    </div>
    {action.note('you')}
    <p className="cn-note"><Link className="lk" href="/welcome?again=1" style={{ marginLeft: -10 }}>Run the setup again</Link> to add more projects, habits or tasks the guided way.</p>
  </Panel>;
}

function Calendars({ feeds, action }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const bad = feeds.some(feed => feed.error);
  return <Panel id="calendar" icon="calendar" title="Calendars"
    state={<State on={feeds.length > 0} bad={bad}>{feeds.length ? feeds.length + (feeds.length === 1 ? ' calendar' : ' calendars') : 'Not connected'}</State>}
    lead="Your events on the Calendar and Today widgets, beside your tasks. Paste a calendar's private iCal address; Mythic reads it every 15 minutes and never writes to it.">
    {feeds.length > 0 && <ul className="cn-rows">{feeds.map(feed => <li key={feed.id}>
      <b>{feed.name}</b><small>{feed.host} · read {when(feed.fetched_at)}</small>
      <span className="cn-right">
        <button type="button" className="lk" disabled={!!action.busy} onClick={() => action.run('feed-' + feed.id, { action: 'calendar_refresh', id: feed.id }, { message: 'Read again.' })}>Refresh</button>
        <button type="button" className="lk" disabled={!!action.busy} onClick={() => action.run('feed-' + feed.id, { action: 'calendar_remove', id: feed.id })}>Remove</button>
      </span>
      {feed.error && <span className="cn-err">{feed.error}</span>}
      {action.note('feed-' + feed.id)}
    </li>)}</ul>}
    <div className="cn-form">
      <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://… or webcal://…" aria-label="iCal address" inputMode="url" spellCheck={false} autoComplete="off" />
      <input className="sm" value={name} onChange={event => setName(event.target.value)} placeholder="Name (optional)" aria-label="Calendar name" maxLength={60} />
      <button type="button" className="btn sm" disabled={!url.trim() || action.busy === 'cal'} onClick={() => action.run('cal', { action: 'calendar_add', url, name }, { message: 'Connected.', after: () => { setUrl(''); setName(''); } })}>{action.busy === 'cal' ? 'Reading…' : 'Connect'}</button>
    </div>
    {action.note('cal')}
    <details className="wl-help">
      <summary>Where do I find the iCal address?</summary>
      <ul>
        <li><b>Google Calendar:</b> Settings, pick the calendar under Settings for my calendars, then Integrate calendar, and copy the <i>Secret address in iCal format</i>.</li>
        <li><b>iCloud:</b> in Calendar on a Mac or iPhone, share the calendar, turn on Public Calendar and copy the webcal link.</li>
        <li><b>Outlook:</b> Settings, Calendar, Shared calendars, Publish a calendar, then copy the ICS link.</li>
        <li><b>Fastmail, Proton and others:</b> look for “share”, “subscribe” or “iCal link” in the calendar’s settings.</li>
      </ul>
    </details>
  </Panel>;
}

function Telegram({ telegram, action }) {
  const [token, setToken] = useState('');
  const state = !telegram.on ? <State>Not connected</State> : telegram.error ? <State bad>{telegram.error}</State> : telegram.linked ? <State on>Linked to {telegram.chat}</State> : <State>Waiting for the link code</State>;
  return <Panel id="telegram" icon="telegram" title="Telegram" state={state}
    lead="Your own bot as a pocket inbox: message it and the line becomes a task. Tasks with Remind me on are sent to you there at their time.">
    {!telegram.on && <>
      <ol className="cn-steps">
        <li>In Telegram, open <b>@BotFather</b>, send <b>/newbot</b> and follow the two questions.</li>
        <li>Copy the token it gives you and paste it here.</li>
      </ol>
      <div className="cn-form">
        <input value={token} onChange={event => setToken(event.target.value)} placeholder="123456789:AA…" aria-label="Bot token" spellCheck={false} autoComplete="off" />
        <button type="button" className="btn sm" disabled={!token.trim() || action.busy === 'tg'} onClick={() => action.run('tg', { action: 'telegram_connect', token }, { after: () => setToken('') })}>Connect</button>
      </div>
    </>}
    {telegram.on && !telegram.linked && <ol className="cn-steps">
      <li>Open <b>{telegram.bot ? '@' + telegram.bot : 'your bot'}</b> in Telegram{telegram.bot && <> (<a className="lk" href={`https://t.me/${telegram.bot}?start=${telegram.code}`} target="_blank" rel="noreferrer">open it</a>)</>}.</li>
      <li>Send it this code: <b className="cn-codeword">{telegram.code}</b>. The bot answers only the chat that sends it.</li>
      <li>Refresh this page once the bot says it is linked.</li>
    </ol>}
    {telegram.on && telegram.linked && <>
      <p className="cn-note">Send the bot a line to add a task; start with <b>work:</b>, <b>life:</b> or <b>home:</b> to file it, <b>note:</b> to save a note, or <b>/today</b> for the day.</p>
      <div className="cn-form"><button type="button" className="btn sm" disabled={!!action.busy} onClick={() => action.run('tg', { action: 'telegram_test' }, { message: 'Sent. Check Telegram.' })}>Send a test</button></div>
    </>}
    {telegram.on && <div className="cn-form"><button type="button" className="lk" disabled={!!action.busy} onClick={() => action.run('tg', { action: 'telegram_disconnect' })}>Disconnect</button></div>}
    {action.note('tg')}
  </Panel>;
}

function ApiToken({ token, origin, action }) {
  const [fresh, setFresh] = useState(null);
  const shown = fresh || '<your token>';
  return <Panel id="api" icon="link" title="API" state={<State on={token.on}>{token.on ? 'Token …' + token.hint : 'No token'}</State>}
    lead="A personal token for your own scripts, an iOS Shortcut, Raycast, Zapier or anything that can send a web request: add tasks and notes, tick habits, read the list.">
    {fresh && <div className="cn-secret" role="status">Copy it now; Mythic only keeps a fingerprint of it and cannot show it again.<code>{fresh}</code></div>}
    <div className="cn-form">
      <button type="button" className="btn sm" disabled={!!action.busy} onClick={() => action.run('token', { action: 'token_issue' }, { after: result => setFresh(result.token) })}>{token.on ? 'Make a new token' : 'Make a token'}</button>
      {token.on && <button type="button" className="lk" disabled={!!action.busy} onClick={() => action.run('token', { action: 'token_revoke' }, { after: () => setFresh(null) })}>Turn the API off</button>}
    </div>
    {action.note('token')}
    {token.on && <p className="cn-note">Made {when(token.created_at)} · last used {when(token.used_at)}. A new token replaces the old one.</p>}
    <code className="cn-code">{`curl -X POST ${origin}/api/v1/tasks \\
  -H "Authorization: Bearer ${shown}" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Book the dentist", "due_day": "2026-10-09", "due_time": "10:00"}'`}</code>
    <p className="cn-note">Also: <b>GET /api/v1/tasks?view=today</b>, <b>POST /api/v1/tasks</b> with <b>{'{"action": "done", "id": "…"}'}</b>, <b>POST /api/v1/notes</b>, <b>GET</b> and <b>POST /api/v1/habits</b>, <b>POST /api/v1/sleep</b>. The README has every field.</p>
  </Panel>;
}

function Health({ health, origin }) {
  return <Panel id="health" icon="moon" title="Apple Health sleep" state={<State on={health.found} bad={!!health.error}>{health.error ? 'Check the Shortcut' : health.found ? 'Reading' : 'Not connected'}</State>}
    lead="Nights from your iPhone or Watch on the Sleep widget. Apple keeps Health data on the phone, so a Shortcut sends it over. Nights you type yourself are never overwritten.">
    {health.error && <p className="cn-err" role="alert">{health.error}</p>}
    {health.found && !health.error && health.last_night && <p className="cn-note">Last night read: {health.last_night}.</p>}
    <p className="cn-note"><b>If Mythic is reachable from your phone</b> (a server, or a tunnel): make a Shortcut that runs <i>Find Health Samples</i> (Sleep Analysis, last 2 days), turns them into lines of <i>start | end | value</i>, and sends them with <i>Get Contents of URL</i> as JSON <b>{'{"samples": "…"}'}</b> to <b>{origin}/api/v1/sleep</b> with your API token. Run it each morning with a Personal Automation.</p>
    <p className="cn-note"><b>If Mythic runs on your Mac</b>: let the same Shortcut <i>Save File</i> the lines to iCloud Drive as <b>Shortcuts/Mythic/sleep.txt</b>. Mythic reads it whenever the Dash loads.</p>
  </Panel>;
}

function Access({ access }) {
  return <Panel id="access" icon="lock" title="Sign-in and your data" state={<State on>{access.password ? 'Password on' : 'This machine only'}</State>}>
    <p className="cn-lead">{access.password
      ? 'Mythic asks for the password in MYTHIC_PASSWORD before it opens, and keeps you signed in for 30 days on each device.'
      : 'Mythic only answers on this machine. To open it from your phone or another computer, set MYTHIC_PASSWORD (and HOST=0.0.0.0) and restart it; the README explains.'}</p>
    <p className="cn-note">Everything lives in <b>{access.data}</b>: the database and your vision board photos. Back up that folder, or download everything as JSON.</p>
    <div className="cn-form">
      <a className="btn sm" href="/api/export" download>Download my data</a>
      {access.password && <button type="button" className="lk" onClick={async () => { await post('/api/login', { action: 'logout' }); window.location.assign('/login'); }}>Sign out</button>}
    </div>
  </Panel>;
}

export default function Connections({ profile, feeds, telegram, token, health, access }) {
  const action = useAction();
  return <div className="dash-root" data-theme="yoru">
    <div className="dash-wrap cn-wrap">
      <nav className="dash-nav" aria-label="Connections">
        <Link className="dash-mark" href="/dash"><i aria-hidden="true" />Mythic<em lang="ja">夜</em></Link>
        <Link className="lk cn-back" href="/dash">Back to the Dash</Link>
      </nav>
      <header className="cn-head">
        <h1>Connections</h1>
        <p>Mythic works on its own. Connect what you already use, each one optional, each one yours: the keys stay in your own database.</p>
      </header>
      <div className="cn-list">
        <You profile={profile} action={action} />
        <Calendars feeds={feeds} action={action} />
        <Telegram telegram={telegram} action={action} />
        <ApiToken token={token} origin={access.origin} action={action} />
        <Health health={health} origin={access.origin} />
        <Access access={access} />
      </div>
    </div>
  </div>;
}
