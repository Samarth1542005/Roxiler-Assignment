import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Check, ChevronDown, CircleUserRound,
  LogOut, MapPin, Search, ShieldCheck, Star, Store as StoreIcon, Users, X
} from 'lucide-react';
import { queryString, request, type Role, type Store, type User } from './api';

type Session = { token: string; user: User };
type Tab = 'overview' | 'users' | 'stores' | 'password';

const nameRule = '.{20,60}';
const passwordRule = '(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,16}';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setChecking(false);
      return;
    }
    request<{ user: User }>('/auth/me')
      .then(({ user }) => setSession({ token, user }))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const handleAdminTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (tab === 'users' || tab === 'stores') setActiveTab(tab);
    };
    window.addEventListener('admin-tab', handleAdminTab);
    return () => window.removeEventListener('admin-tab', handleAdminTab);
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.search-box input')?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const onLogin = (next: Session) => {
    localStorage.setItem('token', next.token);
    setSession(next);
    setActiveTab('overview');
    setError('');
  };

  const logout = () => {
    localStorage.removeItem('token');
    setSession(null);
    setError('');
    setNotice('');
  };

  if (checking) return <div className="loading-screen"><span className="loader" />Loading your workspace</div>;
  if (!session) return <AuthPage onLogin={onLogin} />;

  const roleLabels: Record<Role, string> = { admin: 'Administrator', user: 'Customer', owner: 'Store owner' };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActiveTab('overview'); }}>
          <span className="brand-mark"><Star size={20} fill="currentColor" /></span>
          <span>good<span className="brand-light">store</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={activeTab === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('overview')}>
            <BarChart3 size={18} /> Overview
          </button>
          {session.user.role === 'admin' && (
            <>
              <button className={activeTab === 'users' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('users')}>
                <Users size={18} /> People
              </button>
              <button className={activeTab === 'stores' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('stores')}>
                <StoreIcon size={18} /> Stores
              </button>
            </>
          )}
          {session.user.role === 'user' && (
            <button className={activeTab === 'stores' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('stores')}>
              <StoreIcon size={18} /> Discover stores
            </button>
          )}
          <button className={activeTab === 'password' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('password')}>
            <ShieldCheck size={18} /> Password & security
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-icon"><Star size={15} /></span><span>Good businesses grow<br />with honest feedback.</span></div>
          <div className="profile">
            <div className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy"><strong>{session.user.name}</strong><span>{roleLabels[session.user.role]}</span></div>
            <button className="icon-button logout" onClick={logout} title="Log out" aria-label="Log out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">GoodStore <span>/</span> {activeTab === 'overview' ? 'Overview' : activeTab === 'password' ? 'Security' : activeTab === 'users' ? 'People' : 'Stores'}</div>
          <div className="topbar-right"><span className="live-dot" /> All systems operational <div className="topbar-divider" /><span className="date-label">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span></div>
        </header>
        <div className="page-wrap">
          {error && <div className="alert alert-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
          {session.user.role === 'admin' && (
            <AdminDashboard tab={activeTab} user={session.user} onError={setError} onNotice={setNotice} />
          )}
          {session.user.role === 'user' && (
            activeTab === 'password'
              ? <PasswordPanel onError={setError} onNotice={setNotice} />
              : <CustomerDashboard onError={setError} onNotice={setNotice} />
          )}
          {session.user.role === 'owner' && (
            activeTab === 'password'
              ? <PasswordPanel onError={setError} onNotice={setNotice} />
              : <OwnerDashboard onError={setError} />
          )}
        </div>
      </main>
    </div>
  );
}

function AuthPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/signup';
      const result = await request<Session>(path, { method: 'POST', body: JSON.stringify(data) });
      onLogin(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-story">
        <a className="brand auth-brand" href="#"><span className="brand-mark"><Star size={20} fill="currentColor" /></span><span>good<span className="brand-light">store</span></span></a>
        <div className="story-content">
          <div className="eyebrow"><span className="eyebrow-line" /> A better way to choose</div>
          <h1>Good choices<br />start with <em>good</em><br />reviews.</h1>
          <p>Discover the stores your community loves. Share your experience and help great local businesses thrive.</p>
          <div className="story-proof"><div className="proof-stars">★★★★★</div><span>Real experiences. Better decisions.</span></div>
        </div>
        <div className="auth-decoration decoration-one" /><div className="auth-decoration decoration-two" />
        <div className="story-footer">BUILT FOR COMMUNITIES THAT CARE <span>© GOODSTORE</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-heading"><span className="mini-kicker">YOUR COMMUNITY, IN ONE PLACE</span><h2>{mode === 'login' ? 'Welcome back' : 'Join the community'}</h2><p>{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create an account to find and rate local stores.'}</p></div>
          <div className="auth-tabs"><button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button></div>
          <form onSubmit={submit} className="form-stack">
            {mode === 'signup' && <Field label="Full name"><input name="name" required minLength={20} maxLength={60} pattern={nameRule} placeholder="Your full name" title="Enter between 20 and 60 characters" /></Field>}
            <Field label="Email address"><input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" /></Field>
            {mode === 'signup' && <Field label="Home address"><textarea name="address" maxLength={400} rows={2} placeholder="Street, city, postal code" /></Field>}
            <Field label="Password"><input type="password" name="password" required minLength={mode === 'signup' ? 8 : undefined} maxLength={16} pattern={mode === 'signup' ? passwordRule : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Enter your password" title="8–16 characters, with an uppercase letter and a special character" />{mode === 'signup' && <span className="field-hint">8–16 characters, including an uppercase letter and a special character.</span>}</Field>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to your account' : 'Create your account'}<span>→</span></button>
          </form>
          <div className="auth-footnote"><ShieldCheck size={15} /> Your account information is securely protected.</div>
        </div>
      </section>
    </div>
  );
}

function AdminDashboard({ tab, user, onError, onNotice }: { tab: Tab; user: User; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [summary, setSummary] = useState({ users: 0, stores: 0, ratings: 0 });
  const [loading, setLoading] = useState(true);
  const loadSummary = useCallback(async () => {
    try {
      setSummary(await request('/admin/summary'));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  if (tab === 'password') return <PasswordPanel onError={onError} onNotice={onNotice} />;
  if (tab === 'users') return <AdminUsers onError={onError} onNotice={onNotice} />;
  if (tab === 'stores') return <AdminStores onError={onError} onNotice={onNotice} />;

  return (
    <>
      <PageIntro eyebrow="ADMINISTRATION" title="Your platform at a glance" description={`Welcome back, ${user.name}. Here’s what’s happening across GoodStore today.`} />
      <div className="stats-grid">
        <StatCard label="Registered users" value={summary.users} icon={<Users size={19} />} tone="green" foot="Across all account roles" />
        <StatCard label="Listed stores" value={summary.stores} icon={<StoreIcon size={19} />} tone="peach" foot="Businesses on the platform" />
        <StatCard label="Ratings submitted" value={summary.ratings} icon={<Star size={19} />} tone="blue" foot="Community ratings to date" />
      </div>
      <div className="dashboard-grid">
        <section className="panel welcome-panel"><div className="panel-kicker">YOUR CONTROL ROOM</div><h2>Small actions.<br /><span>Stronger communities.</span></h2><p>Keep the directory useful and welcoming. Add new businesses, make sure people have the right access, and let every voice count.</p><div className="welcome-tags"><span><Check size={13} /> Trusted community</span><span><Check size={13} /> Real reviews</span></div></section>
        <section className="panel quick-panel"><div className="section-heading"><div><span className="panel-kicker">QUICK ACTIONS</span><h3>Make something happen</h3></div><ChevronDown size={16} className="muted-icon" /></div><button className="quick-action" onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'users' }))}><span className="quick-icon lavender"><Users size={17} /></span><span><strong>Add a new user</strong><small>Give someone a place in the community</small></span><span className="quick-arrow">↗</span></button><button className="quick-action" onClick={() => window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'stores' }))}><span className="quick-icon mint"><StoreIcon size={17} /></span><span><strong>List a new store</strong><small>Bring a great local business on board</small></span><span className="quick-arrow">↗</span></button><div className="activity-note"><span className="live-dot" />{loading ? 'Updating your overview…' : 'Your overview is up to date'}</div></section>
      </div>
      <div className="bottom-note"><span className="note-mark"><Star size={16} /></span><div><strong>Make every rating count.</strong><span>GoodStore works best when the information is accurate and the feedback is honest.</span></div></div>
    </>
  );
}

function AdminUsers({ onError, onNotice }: { onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState('name');
  const [direction, setDirection] = useState('asc');
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await request<{ users: AdminUser[] }>(`/admin/users${queryString({ search, role, sort, direction })}`);
      setUsers(data.users);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load users.');
    }
  }, [search, role, sort, direction, onError]);
  useEffect(() => { void load(); }, [load]);

  const toggleSort = (field: string) => {
    setDirection(sort === field && direction === 'asc' ? 'desc' : 'asc');
    setSort(field);
  };
  const openDetail = async (id: string) => {
    try {
      const result = await request<{ user: AdminUser }>(`/admin/users/${id}`);
      setDetail(result.user);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load user details.');
    }
  };

  return (
    <>
      <PageIntro eyebrow="PEOPLE DIRECTORY" title="The people behind it" description="Manage community access and keep track of every account." action={<button className="button button-primary" onClick={() => setShowForm((open) => !open)}>{showForm ? <X size={16} /> : <span className="plus">+</span>}{showForm ? 'Close form' : 'Add a person'}</button>} />
      {showForm && <CreateUserForm onCreated={() => { setShowForm(false); onNotice('Account created successfully.'); void load(); }} onError={onError} />}
      <section className="panel table-panel">
        <div className="table-toolbar"><div><h3>All accounts <span className="count-pill">{users.length}</span></h3><p>Search and sort registered users</p></div><div className="filter-row"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or address" aria-label="Search users" /><kbd>⌘ K</kbd></label><select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="user">Customer</option><option value="owner">Store owner</option></select></div></div>
        <div className="table-scroll"><table><thead><tr><SortHeader label="Name" field="name" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Email" field="email" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Address" field="address" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Role" field="role" current={sort} direction={direction} onSort={toggleSort} /><th>Rating</th></tr></thead><tbody>
          {users.map((person) => <tr key={person.id}><td><div className="table-person"><div className={`mini-avatar ${person.role}`}>{person.name.slice(0, 1).toUpperCase()}</div><button className="text-button" onClick={() => void openDetail(person.id)}>{person.name}</button></div></td><td>{person.email}</td><td className="address-cell">{person.address || '—'}</td><td><RoleBadge role={person.role} /></td><td>{person.role === 'owner' ? <RatingValue value={person.rating ?? null} /> : <span className="table-muted">—</span>}</td></tr>)}
          {!users.length && <EmptyRow colSpan={5} text="No matching users. Adjust your filters or add someone new." />}
        </tbody></table></div>
        <TableFooter count={users.length} label="people" />
      </section>
      {detail && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="panel detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="icon-button detail-close" onClick={() => setDetail(null)} aria-label="Close user details"><X size={18} /></button><div className="detail-avatar">{detail.name.slice(0, 1).toUpperCase()}</div><span className="panel-kicker">ACCOUNT DETAILS</span><h2 id="detail-title">{detail.name}</h2><dl className="detail-list"><div><dt>Email</dt><dd>{detail.email}</dd></div><div><dt>Address</dt><dd>{detail.address || '—'}</dd></div><div><dt>Role</dt><dd><RoleBadge role={detail.role} /></dd></div>{detail.role === 'owner' && <div><dt>Store rating</dt><dd><RatingValue value={detail.rating ?? null} /></dd></div>}</dl></section></div>}
    </>
  );
}

type AdminUser = User & { rating?: number | null };

function AdminStores({ onError, onNotice }: { onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [direction, setDirection] = useState('asc');
  const [showForm, setShowForm] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await request<{ stores: Store[] }>(`/admin/stores${queryString({ search, sort, direction })}`);
      setStores(data.stores);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load stores.');
    }
  }, [search, sort, direction, onError]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    request<{ users: User[] }>('/admin/users?role=owner').then((data) => setOwners(data.users)).catch((error: unknown) => onError(error instanceof Error ? error.message : 'Could not load owners.'));
  }, [onError]);
  const toggleSort = (field: string) => { setDirection(sort === field && direction === 'asc' ? 'desc' : 'asc'); setSort(field); };

  return (
    <>
      <PageIntro eyebrow="STORE DIRECTORY" title="Local places, all in one place" description="Add businesses to the directory and connect them with their store owners." action={<button className="button button-primary" onClick={() => setShowForm((open) => !open)}>{showForm ? <X size={16} /> : <span className="plus">+</span>}{showForm ? 'Close form' : 'Add a store'}</button>} />
      {showForm && <CreateStoreForm owners={owners} onCreated={() => { setShowForm(false); onNotice('Store added to the directory.'); void load(); }} onError={onError} />}
      <section className="panel table-panel">
        <div className="table-toolbar"><div><h3>All stores <span className="count-pill">{stores.length}</span></h3><p>Search by business name, email or address</p></div><div className="filter-row"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the directory" aria-label="Search stores" /></label></div></div>
        <div className="table-scroll"><table><thead><tr><SortHeader label="Store" field="name" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Email" field="email" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Address" field="address" current={sort} direction={direction} onSort={toggleSort} /><th>Store owner</th><th>Rating</th></tr></thead><tbody>
          {stores.map((store) => <tr key={store.id}><td><div className="store-table-name"><span className="store-mini"><StoreIcon size={16} /></span><strong>{store.name}</strong></div></td><td>{store.email}</td><td className="address-cell">{store.address}</td><td>{store.owner_name || <span className="table-muted">Unassigned</span>}</td><td><RatingValue value={store.rating ?? null} count={store.rating_count} /></td></tr>)}
          {!stores.length && <EmptyRow colSpan={5} text="No matching stores. Add your first business to get started." />}
        </tbody></table></div><TableFooter count={stores.length} label="stores" />
      </section>
    </>
  );
}

function CustomerDashboard({ onError, onNotice }: { onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'address' | 'rating'>('name');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [busyId, setBusyId] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const sortedStores = useMemo(() => [...stores].sort((a, b) => {
    const comparison = sort === 'rating'
      ? Number(a.overall_rating || 0) - Number(b.overall_rating || 0)
      : String(a[sort]).localeCompare(String(b[sort]));
    return direction === 'asc' ? comparison : -comparison;
  }), [stores, sort, direction]);
  const load = useCallback(async () => {
    try {
      const data = await request<{ stores: Store[] }>(`/stores${queryString({ search })}`);
      setStores(data.stores);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load stores.');
    }
  }, [search, onError]);
  useEffect(() => { void load(); }, [load]);

  const rate = async (storeId: string, currentRating: number | null | undefined) => {
    const value = selected[storeId] ?? currentRating;
    if (!value) {
      onError('Choose a star rating before submitting.');
      return;
    }
    setBusyId(storeId);
    try {
      await request(`/stores/${storeId}/rating`, { method: 'PUT', body: JSON.stringify({ value }) });
      onNotice('Your rating has been saved. Thanks for sharing!');
      await load();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save your rating.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <>
      <PageIntro eyebrow="THE LOCAL GUIDE" title={<>Find your next<br className="desktop-break" /> <em>favorite</em> place.</>} description="Discover community-loved stores and share the experiences that matter." />
      <div className="discover-toolbar"><div className="discover-copy"><span className="section-label">THE DIRECTORY</span><strong>{stores.length} {stores.length === 1 ? 'place' : 'places'} to explore</strong></div><div className="discover-controls"><label className="search-box discover-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try a store name or neighborhood…" aria-label="Search stores by name or address" /><kbd>⌘ K</kbd></label><select aria-label="Sort stores by" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="name">Name</option><option value="address">Address</option><option value="rating">Rating</option></select><button className="sort-direction" onClick={() => setDirection((value) => value === 'asc' ? 'desc' : 'asc')} aria-label={`Sort ${direction === 'asc' ? 'descending' : 'ascending'}`}>{direction === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</button></div></div>
      <div className="store-grid">
        {sortedStores.map((store, index) => <article className="store-card" key={store.id}>
          <div className={`store-art art-${index % 4}`}><div className="art-shape shape-main"><StoreIcon size={26} /></div><span className="art-caption">LOCAL · COMMUNITY · GOOD</span>{store.overall_rating && <span className="art-rating"><Star size={13} fill="currentColor" /> {Number(store.overall_rating).toFixed(1)}</span>}</div>
          <div className="store-card-content"><div className="store-title-row"><h3>{store.name}</h3><span className="rating-number">{store.overall_rating ? <><Star size={14} fill="currentColor" />{Number(store.overall_rating).toFixed(1)}</> : 'New'}</span></div><p className="store-address"><MapPin size={14} />{store.address}</p><p className="review-count">{store.rating_count ? `${store.rating_count} ${store.rating_count === 1 ? 'community rating' : 'community ratings'}` : 'Be the first to rate this store'}</p>
            <div className="rate-divider" /><div className="your-rating"><span>{store.user_rating ? 'Your rating' : 'Rate this place'}</span><StarPicker value={selected[store.id] ?? store.user_rating ?? 0} onChange={(value) => setSelected((previous) => ({ ...previous, [store.id]: value }))} /></div>
            <button className={`button ${store.user_rating ? 'button-outline' : 'button-dark'} rating-submit`} disabled={busyId === store.id} onClick={() => void rate(store.id, store.user_rating)}>{busyId === store.id ? 'Saving…' : store.user_rating ? 'Update your rating' : 'Submit rating'}<span>→</span></button>
          </div>
        </article>)}
        {!stores.length && <div className="empty-card"><span className="empty-icon"><Search size={22} /></span><h3>No places found</h3><p>Try a different search, or check back as more stores join the community.</p></div>}
      </div>
    </>
  );
}

function OwnerDashboard({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<{ store: Store | null; ratings: { name: string; email: string; value: number; updated_at: string }[] } | null>(null);
  const [sort, setSort] = useState('updated_at');
  const [direction, setDirection] = useState('desc');
  const load = useCallback(async () => {
    try {
      setData(await request<{ store: Store | null; ratings: { name: string; email: string; value: number; updated_at: string }[] }>(`/owner/dashboard${queryString({ sort, direction })}`));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load your store.');
    }
  }, [sort, direction, onError]);
  useEffect(() => {
    void load();
  }, [load]);
  const toggleSort = (field: string) => {
    setDirection(sort === field && direction === 'asc' ? 'desc' : 'asc');
    setSort(field);
  };
  return (
    <>
      <PageIntro eyebrow="OWNER DASHBOARD" title={data?.store?.name || 'Your store'} description="See what your customers are saying and how your business is rated." />
      {!data ? <LoadingPanel /> : !data.store ? <div className="panel empty-owner"><span className="empty-icon"><StoreIcon size={22} /></span><h3>Your store is not connected yet</h3><p>Ask a platform administrator to assign your owner account to a store.</p></div> : <>
        <div className="owner-stats"><StatCard label="Average rating" value={data.store.average_rating ? Number(data.store.average_rating).toFixed(1) : '—'} icon={<Star size={19} />} tone="green" foot="Out of 5 community stars" /><StatCard label="Total reviews" value={data.store.rating_count} icon={<Users size={19} />} tone="peach" foot="Customers who shared feedback" /><div className="panel owner-address"><span className="panel-kicker">YOUR LOCATION</span><div><MapPin size={18} /><strong>{data.store.address}</strong></div><span className="table-muted">{data.store.name}</span></div></div>
        <section className="panel table-panel owner-reviews"><div className="table-toolbar"><div><h3>Customer feedback <span className="count-pill">{data.ratings.length}</span></h3><p>People who took a moment to rate your store</p></div></div><div className="table-scroll"><table><thead><tr><SortHeader label="Customer" field="name" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Email" field="email" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Rating" field="value" current={sort} direction={direction} onSort={toggleSort} /><SortHeader label="Last updated" field="updated_at" current={sort} direction={direction} onSort={toggleSort} /></tr></thead><tbody>{data.ratings.map((rating, index) => <tr key={`${rating.email}-${index}`}><td><div className="table-person"><div className="mini-avatar user">{rating.name.slice(0, 1).toUpperCase()}</div><strong>{rating.name}</strong></div></td><td>{rating.email}</td><td><StarDisplay value={rating.value} /></td><td>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(rating.updated_at))}</td></tr>)}{!data.ratings.length && <EmptyRow colSpan={4} text="No ratings yet. Your first customer review will appear here." />}</tbody></table></div><TableFooter count={data.ratings.length} label="reviews" /></section>
      </>}
    </>
  );
}

function PasswordPanel({ onError, onNotice }: { onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    if (values.newPassword !== values.confirmPassword) {
      onError('The new passwords do not match.');
      setBusy(false);
      return;
    }
    try {
      await request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) });
      form.reset();
      onNotice('Your password has been updated.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  };
  return <>
    <PageIntro eyebrow="ACCOUNT SECURITY" title="Keep your account safe" description="Update your password regularly to help protect your account." />
    <section className="panel password-panel"><div className="security-icon"><ShieldCheck size={22} /></div><div className="password-copy"><h3>Change password</h3><p>Choose a password you don’t use anywhere else.</p><form className="password-form" onSubmit={submit}><Field label="Current password"><input name="currentPassword" type="password" required autoComplete="current-password" /></Field><Field label="New password"><input name="newPassword" type="password" required minLength={8} maxLength={16} pattern={passwordRule} title="8–16 characters, with an uppercase letter and a special character" autoComplete="new-password" /><span className="field-hint">8–16 characters, including an uppercase letter and a special character.</span></Field><Field label="Confirm new password"><input name="confirmPassword" type="password" required minLength={8} maxLength={16} autoComplete="new-password" /></Field><button className="button button-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}<span>→</span></button></form></div></section>
  </>;
}

function CreateUserForm({ onCreated, onError }: { onCreated: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await request('/admin/users', { method: 'POST', body: JSON.stringify(values) });
      onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not create account.');
    } finally { setBusy(false); }
  };
  return <section className="panel create-panel"><div className="create-heading"><span className="quick-icon lavender"><CircleUserRound size={18} /></span><div><h3>Create an account</h3><p>Account names must be 20–60 characters.</p></div></div><form className="create-form" onSubmit={submit}><Field label="Full name"><input name="name" required minLength={20} maxLength={60} pattern={nameRule} placeholder="20 to 60 characters" /></Field><Field label="Email"><input name="email" type="email" required maxLength={254} placeholder="name@example.com" /></Field><Field label="Address"><input name="address" maxLength={400} placeholder="Street, city, postal code" /></Field><Field label="Temporary password"><input name="password" type="password" required minLength={8} maxLength={16} pattern={passwordRule} title="8–16 characters, with an uppercase letter and a special character" /><span className="field-hint">8–16 characters, uppercase + special character.</span></Field><Field label="Role"><select name="role" required defaultValue="user"><option value="user">Normal user</option><option value="owner">Store owner</option><option value="admin">Administrator</option></select></Field><button className="button button-primary create-submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}<span>→</span></button></form></section>;
}

function CreateStoreForm({ owners, onCreated, onError }: { owners: User[]; onCreated: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    try {
      await request('/admin/stores', { method: 'POST', body: JSON.stringify({ ...values, ownerId: values.ownerId || null }) });
      onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not add store.');
    } finally { setBusy(false); }
  };
  return <section className="panel create-panel"><div className="create-heading"><span className="quick-icon mint"><StoreIcon size={18} /></span><div><h3>Add a local store</h3><p>List a business and optionally connect an existing owner account.</p></div></div><form className="create-form store-create-form" onSubmit={submit}><Field label="Store name"><input name="name" required maxLength={120} placeholder="Business name" /></Field><Field label="Contact email"><input name="email" type="email" required maxLength={254} placeholder="hello@business.com" /></Field><Field label="Address"><input name="address" required maxLength={400} placeholder="Street, city, postal code" /></Field><Field label="Store owner"><select name="ownerId" defaultValue=""><option value="">No owner assigned</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>)}</select></Field><button className="button button-primary create-submit" disabled={busy}>{busy ? 'Adding…' : 'Add store'}<span>→</span></button></form></section>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="page-eyebrow"><span />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="intro-action">{action}</div>}</div>;
}

function StatCard({ label, value, icon, tone, foot }: { label: string; value: string | number; icon: ReactNode; tone: string; foot: string }) {
  return <section className="panel stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-foot"><span className="stat-indicator">↗</span>{foot}</span></section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>;
}

function SortHeader({ label, field, current, direction, onSort }: { label: string; field: string; current: string; direction: string; onSort: (field: string) => void }) {
  const icon = current !== field ? <ArrowUpDown size={13} /> : direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  return <th><button className={`sort-button ${current === field ? 'sort-active' : ''}`} onClick={() => onSort(field)}>{label}{icon}</button></th>;
}

function RoleBadge({ role }: { role: Role }) {
  const label: Record<Role, string> = { admin: 'Admin', user: 'Customer', owner: 'Store owner' };
  return <span className={`role-badge ${role}`}><span />{label[role]}</span>;
}

function RatingValue({ value, count }: { value: number | null; count?: number }) {
  return value == null ? <span className="table-muted">No ratings</span> : <span className="rating-value"><Star size={14} fill="currentColor" />{Number(value).toFixed(1)}{count !== undefined && <small>({count})</small>}</span>;
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="star-picker" role="radiogroup" aria-label="Choose a rating from 1 to 5">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" role="radio" aria-checked={value === star} aria-label={`${star} star${star > 1 ? 's' : ''}`} className={value >= star ? 'filled' : ''} onClick={() => onChange(star)}><Star size={19} fill="currentColor" /></button>)}</div>;
}

function StarDisplay({ value }: { value: number }) {
  return <span className="rating-value"><span className="star-string">{'★'.repeat(value)}<span>{'★'.repeat(5 - value)}</span></span><strong>{value}.0</strong></span>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td className="empty-row" colSpan={colSpan}>{text}</td></tr>;
}

function TableFooter({ count, label }: { count: number; label: string }) {
  return <div className="table-footer"><span>Showing <strong>{count}</strong> {count === 1 ? label.replace(/s$/, '') : label}</span><span className="table-footer-end">Sorted alphabetically <span className="footer-dot">·</span> Updated just now</span></div>;
}

function LoadingPanel() {
  return <div className="panel loading-panel"><span className="loader" />Loading your store…</div>;
}

export default App;
