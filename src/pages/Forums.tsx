import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Loader } from '../components/Loader';
import { useContracts } from '../hooks/useContracts';
import { useEthers } from '../hooks/useEthers';
import { truncateAddress, formatDate } from '../utils/formatters';

interface ForumRow { id: bigint; title: string; creator: string; createdAt: bigint; }

export function Forums() {
  const contracts = useContracts();
  const { address } = useEthers();
  const nav = useNavigate();

  const [openId, setOpenId] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tab] = useState<'mine'|'all'>('mine');
  const [loading, setLoading] = useState(false);
  const [forums, setForums] = useState<ForumRow[]>([]);
  const [stats, setStats] = useState<Record<string, { posts: number; comments: number; score: bigint; latestPostId?: bigint }>>({});
  const [commentByForum, setCommentByForum] = useState<Record<string, string>>({});

  const myForums = useMemo(() => forums.filter(f => f.creator?.toLowerCase?.() === address?.toLowerCase?.()), [forums, address]);

  const loadForums = async () => {
    if (!contracts?.forums) return;
    try {
      setLoading(true);
      const prov: any = (contracts.forums as any).runner?.provider;
      const latest = await prov.getBlockNumber();
      const to = BigInt(latest);
      const window = 500000n;
      const fromWin = to > window ? (to - window) : 0n;
      const scan = async (from: bigint, toBlock: bigint) => {
        const created = await contracts.forums.queryFilter(contracts.forums.filters.ForumCreated(), from, toBlock);
        const deleted = await contracts.forums.queryFilter(contracts.forums.filters.ForumDeleted(), from, toBlock);
        const deletedSet = new Set<string>();
        for (const ev of deleted) {
          const anyEv: any = ev as any;
          const fidVal = anyEv?.args?.forumId ?? anyEv?.args?.[0];
          if (fidVal !== undefined) deletedSet.add(fidVal.toString());
        }
        const rows: ForumRow[] = [];
        for (const ev of created) {
          const anyEv: any = ev as any;
          const fidVal = anyEv?.args?.forumId ?? anyEv?.args?.[0];
          const fid = fidVal !== undefined ? BigInt(fidVal.toString()) : undefined;
          if (!fid) continue;
          if (deletedSet.has(fid.toString())) continue;
          try {
            const f = await contracts.forums.forums(fid);
            if (f?.creator && f?.title) {
              rows.push({ id: fid, title: f.title, creator: f.creator, createdAt: f.createdAt || BigInt(0) });
            }
          } catch {}
        }
        rows.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
        return rows;
      };
      let rows = await scan(fromWin, to);
      if (rows.length === 0) rows = await scan(0n, to);
      setForums(rows);
    } catch (e) {
      console.error('loadForums failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadForums(); }, [contracts]);

  // Load derived stats per forum (posts count, comments count, total score, latest post id)
  useEffect(() => {
    const loadStats = async () => {
      if (!contracts?.forums || forums.length === 0) return;
      const next: Record<string, { posts: number; comments: number; score: bigint; latestPostId?: bigint }> = {};
      for (const f of forums) {
        try {
          const pids: bigint[] = await contracts.forums.getPostsForForum(f.id);
          let commentsCount = 0;
          let totalScore = 0n;
          let latestPid: bigint | undefined = undefined;
          let latestTs: bigint = 0n;
          for (const pid of pids) {
            const cids: bigint[] = await contracts.forums.getCommentsForPost(pid);
            commentsCount += cids.length;
            const p = await contracts.forums.posts(pid);
            totalScore += BigInt(p.score);
            const pts: bigint = BigInt(p.ts);
            if (!latestPid || pts > latestTs) { latestPid = pid; latestTs = pts; }
          }
          next[f.id.toString()] = { posts: pids.length, comments: commentsCount, score: totalScore, latestPostId: latestPid };
        } catch {}
      }
      setStats(next);
    };
    loadStats();
  }, [contracts, forums]);

  const quickVoteLatest = async (fid: bigint, dir: 1 | -1) => {
    if (!contracts?.forums) return;
    const s = stats[fid.toString()];
    const pid = s?.latestPostId;
    if (!pid) { alert('No posts yet to vote'); return; }
    try {
      const tx = await contracts.forums.votePost(pid, dir);
      await tx.wait();
      await loadForums();
    } catch (e: any) { alert(e?.message || 'Failed to vote'); }
  };

  const quickCommentLatest = async (fid: bigint) => {
    if (!contracts?.forums) return;
    const s = stats[fid.toString()];
    const pid = s?.latestPostId;
    const text = (commentByForum[fid.toString()] || '').trim();
    if (!pid) { alert('No posts yet to comment'); return; }
    if (!text) return;
    try {
      const tx = await contracts.forums.createComment(pid, text);
      await tx.wait();
      setCommentByForum(prev => ({ ...prev, [fid.toString()]: '' }));
    } catch (e: any) { alert(e?.message || 'Failed to comment'); }
  };

  // Live updates
  useEffect(() => {
    if (!contracts?.forums) return;
    const onCreated = () => { loadForums(); };
    const onDeleted = () => { loadForums(); };
    const f = contracts.forums as any;
    f.on('ForumCreated', onCreated);
    f.on('ForumDeleted', onDeleted);
    return () => {
      try {
        f.off('ForumCreated', onCreated);
        f.off('ForumDeleted', onDeleted);
      } catch {}
    };
  }, [contracts]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contracts?.forums || !title.trim()) return;
    try {
      const tx = await contracts.forums.createForum(title.trim());
      const rc = await tx.wait();
      setTitle('');
      setDesc('');
      await loadForums();
      const ev = (rc as any).logs?.find((l: any) => (l.eventName === 'ForumCreated')) as any;
      if (ev?.args?.forumId) nav(`/forums/${ev.args.forumId}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to create forum');
    }
  };

  const del = async (fid: bigint) => {
    if (!contracts?.forums) return;
    if (!confirm('Delete this forum?')) return;
    try {
      const tx = await contracts.forums.deleteForum(fid);
      await tx.wait();
      await loadForums();
    } catch (e: any) { alert(e?.message || 'Failed to delete'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Forums</h1>
      </div>

      <Card>
        <form onSubmit={create} className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Input label="Title" placeholder="Forum title" value={title} onChange={e=>setTitle(e.target.value)} required />
            <Input label="Open forum by ID" placeholder="e.g. 1" value={openId} onChange={e=>setOpenId(e.target.value)} />
          </div>
          <Textarea label="Description (optional, off-chain)" placeholder="Short description for your forum" value={desc} onChange={e=>setDesc(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={!title.trim()}>Create</Button>
            <Button variant="secondary" onClick={() => { if (openId.trim()) nav(`/forums/${openId.trim()}`); }} disabled={!openId.trim()}>Open</Button>
            <Button variant="secondary" onClick={loadForums} disabled={loading}>{loading? 'Loading…':'Refresh'}</Button>
          </div>
        </form>
      </Card>

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader /> Loading…</div>
        ) : (
          <div className="grid gap-3">
            {myForums.length === 0 ? (
              <div className="text-sm text-gray-500">No forums</div>
            ) : (
              myForums.map(f => (
                <Card key={f.id.toString()} hover>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-semibold">{f.title || `Forum #${f.id.toString()}`}</div>
                      <div className="text-xs text-gray-500">{truncateAddress(f.creator)} · {formatDate(f.createdAt)}</div>
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        {(() => { const s = stats[f.id.toString()]; return s ? `${s.posts} posts · ${s.comments} comments · score ${s.score.toString()}` : '…'; })()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={()=>nav(`/forums/${f.id.toString()}`)}>View</Button>
                      {f.creator?.toLowerCase?.() === address?.toLowerCase?.() && (
                        <Button variant="danger" onClick={()=>del(f.id)}>Delete</Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

