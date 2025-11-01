import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useEthers } from '../hooks/useEthers';
import { useContracts } from '../hooks/useContracts';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Loader } from '../components/Loader';
import { truncateAddress, formatDate } from '../utils/formatters';
import { useInterval } from '../utils/useInterval';

interface SessionRow {
  id: bigint;
  a: string;
  b: string;
  closed: boolean;
  lastCid: string;
  createdAt: bigint;
}

interface GroupRow {
  id: bigint;
  name: string;
  creator: string;
  createdAt: bigint;
}

export function Chats() {
  const { address } = useEthers();
  const contracts = useContracts();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [active, setActive] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPeer, setNewPeer] = useState('');
  const [msg, setMsg] = useState('');

  // Group state
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState(''); // comma-separated addresses
  const [groupId, setGroupId] = useState('');
  const [memberAddr, setMemberAddr] = useState('');
  const [groupMsg, setGroupMsg] = useState('');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupMessages, setGroupMessages] = useState<Array<{ from: string; cid: string; ts: bigint }>>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const activeSession = useMemo(() => sessions.find(s => s.id === active) || null, [sessions, active]);

  const loadSessions = async () => {
    if (!contracts?.chats || !address) return;
    try {
      setLoading(true);
      const ids: bigint[] = await contracts.chats.getMySessions(address);
      const rows: SessionRow[] = [];
      for (const id of ids) {
        const s = await contracts.chats.sessions(id);
        rows.push({
          id,
          a: s.a,
          b: s.b,
          closed: s.closed,
          lastCid: s.lastCid,
          createdAt: s.createdAt || BigInt(0),
        });
      }
      rows.sort((x, y) => Number(y.createdAt) - Number(x.createdAt));
      setSessions(rows);
      if (rows.length && !active) setActive(rows[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [contracts, address]);

  // Load groups: recent window, then fallback full scan if empty. Includes groups I created and groups I was added to.
  const loadGroups = async () => {
    if (!contracts?.chats || !address) return;
    try {
      const prov: any = (contracts.chats as any).runner?.provider;
      const latest = await prov.getBlockNumber();
      const scan = async (from: bigint, to: bigint) => {
        const mine = await contracts.chats.queryFilter(contracts.chats.filters.GroupCreated(null, address), from, to);
        const addedAny = await contracts.chats.queryFilter(contracts.chats.filters.GroupMemberAdded(), from, to);
        const candidates = new Set<bigint>();
        for (const ev of mine) {
          const anyEv: any = ev as any;
          const gidVal = anyEv?.args?.groupId ?? anyEv?.args?.[0];
          const gid = gidVal !== undefined ? BigInt(gidVal.toString()) : undefined;
          if (gid) candidates.add(gid);
        }
        for (const ev of addedAny) {
          const anyEv: any = ev as any;
          const added = (anyEv?.args?.added as string) || anyEv?.args?.[1] || '';
          if (added.toLowerCase?.() === address.toLowerCase()) {
            const gidVal = anyEv?.args?.groupId ?? anyEv?.args?.[0];
            const gid = gidVal !== undefined ? BigInt(gidVal.toString()) : undefined;
            if (gid) candidates.add(gid);
          }
        }
        const rows: GroupRow[] = [];
        for (const gid of candidates) {
          try {
            const g = await contracts.chats.groups(gid);
            if (g.exists) {
              rows.push({ id: gid, name: g.name, creator: g.creator, createdAt: g.createdAt || BigInt(0) });
            }
          } catch {}
        }
        // Sort newest first
        rows.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
        return rows;
      };

      const to = BigInt(latest);
      const window = 500000n;
      const fromWin = to > window ? (to - window) : 0n;
      let rows = await scan(fromWin, to);
      if (rows.length === 0) {
        rows = await scan(0n, to);
      }
      setGroups(rows);
    } catch (e) {
      console.error('loadGroups failed', e);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [contracts, address]);

  // Live updates for groups
  useEffect(() => {
    if (!contracts?.chats || !address) return;
    const onCreated = (groupId: bigint, creator: string) => {
      if (creator?.toLowerCase?.() === address.toLowerCase()) loadGroups();
    };
    const onAdded = (gid: bigint, added: string) => {
      if (added?.toLowerCase?.() === address.toLowerCase()) loadGroups();
    };
    const onDeleted = (gid: bigint) => {
      setGroups(prev => prev.filter(g => g.id !== BigInt(gid as any)));
    };
    const onRemoved = (gid: bigint, removed: string) => {
      if (removed?.toLowerCase?.() === address.toLowerCase()) {
        setGroups(prev => prev.filter(g => g.id !== BigInt(gid as any)));
      }
    };
    const ch = contracts.chats;
    ch.on('GroupCreated', onCreated as any);
    ch.on('GroupMemberAdded', onAdded as any);
    ch.on('GroupDeleted', onDeleted as any);
    ch.on('GroupMemberRemoved', onRemoved as any);
    return () => {
      try {
        ch.off('GroupCreated', onCreated as any);
        ch.off('GroupMemberAdded', onAdded as any);
        ch.off('GroupDeleted', onDeleted as any);
        ch.off('GroupMemberRemoved', onRemoved as any);
      } catch {}
    };
  }, [contracts, address]);

  useInterval(() => {
    if (!contracts?.chats || !active) return;
    (async () => {
      try {
        const last = await contracts.chats.getLastCid(active);
        setSessions(prev => prev.map(s => (s.id === active ? { ...s, lastCid: last } : s)));
      } catch {}
    })();
  }, 5000);

  const create1to1 = async () => {
    if (!contracts?.chats || !newPeer) return;
    try {
      const tx = await contracts.chats.createSession(newPeer);
      await tx.wait();
      setNewPeer('');
      loadSessions();
    } catch (e: any) {
      alert(e?.message || 'Failed to create session');
    }
  };

  const send = async () => {
    if (!contracts?.chats || !active || !msg.trim()) return;
    try {
      const tx = await contracts.chats.sendMessage(active, msg.trim());
      await tx.wait();
      setMsg('');
      loadSessions();
    } catch (e: any) {
      alert(e?.message || 'Failed to send');
    }
  };

  const end = async () => {
    if (!contracts?.chats || !active) return;
    if (!confirm('End this session?')) return;
    try {
      const tx = await contracts.chats.endSession(active);
      await tx.wait();
      loadSessions();
    } catch (e: any) {
      alert(e?.message || 'Failed to end session');
    }
  };

  // Group helpers (IDs must be known externally; contract has no lister)
  const createGroup = async () => {
    if (!contracts?.chats || !groupName.trim()) return;
    try {
      const members = groupMembers.split(',').map(s => s.trim()).filter(Boolean);
      const tx = await contracts.chats.createGroup(groupName.trim(), members);
      const rc = await tx.wait();
      setGroupName('');
      setGroupMembers('');
      // Try to read groupId from receipt to optimistic update
      const log = (rc as any).logs?.find((l: any) => l.eventName === 'GroupCreated');
      if (log?.args?.groupId) {
        const gid = BigInt(log.args.groupId.toString());
        try {
          const g = await contracts.chats.groups(gid);
          if (g.exists) {
            setGroups(prev => [{ id: gid, name: g.name, creator: g.creator, createdAt: g.createdAt || BigInt(0) }, ...prev.filter(x => x.id !== gid)]);
          }
        } catch {}
      } else {
        await loadGroups();
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to create group');
    }
  };

  const addMember = async () => {
    if (!contracts?.chats || !groupId || !memberAddr) return;
    try {
      const tx = await contracts.chats.addMember(BigInt(groupId), memberAddr);
      await tx.wait();
      setMemberAddr('');
      alert('Member added');
    } catch (e: any) {
      alert(e?.message || 'Failed to add member');
    }
  };

  const removeMember = async () => {
    if (!contracts?.chats || !groupId || !memberAddr) return;
    try {
      const tx = await contracts.chats.removeMember(BigInt(groupId), memberAddr);
      await tx.wait();
      setMemberAddr('');
      alert('Member removed');
    } catch (e: any) {
      alert(e?.message || 'Failed to remove member');
    }
  };

  const sendGroup = async () => {
    if (!contracts?.chats || !groupId || !groupMsg.trim()) return;
    try {
      const tx = await contracts.chats.sendGroupMessage(BigInt(groupId), groupMsg.trim());
      const rc = await tx.wait();
      setGroupMsg('');
      // Optimistic update from receipt
      const log = (rc as any).logs?.find((l: any) => l.eventName === 'GroupMessage');
      if (log && log.args) {
        const gid = BigInt((log.args.groupId ?? log.args[0]).toString());
        if (groupId && gid === BigInt(groupId)) {
          const from = (log.args.from ?? log.args[1]) as string;
          const cid = (log.args.cid ?? log.args[2]) as string;
          const ts = BigInt((log.args.ts ?? log.args[3]).toString());
          setGroupMessages(prev => [{ from, cid, ts }, ...prev]);
        } else {
          await loadGroupMessages();
        }
      } else {
        await loadGroupMessages();
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to send message');
    }
  };

  const loadGroupMessages = async () => {
    if (!contracts?.chats || !groupId) return;
    try {
      setGroupLoading(true);
      const prov: any = (contracts.chats as any).runner?.provider;
      const latest = await prov.getBlockNumber();
      const to = BigInt(latest);
      const window = 500000n;
      const fromWin = to > window ? (to - window) : 0n;
      const scan = async (from: bigint, toBlock: bigint) => {
        const logs = await contracts.chats.queryFilter(contracts.chats.filters.GroupMessage(BigInt(groupId)), from, toBlock);
        const rows = logs.map((ev: any) => {
          const gid = BigInt((ev.args?.groupId ?? ev.args?.[0]).toString());
          if (gid !== BigInt(groupId)) return null;
          const from = (ev.args?.from ?? ev.args?.[1]) as string;
          const cid = (ev.args?.cid ?? ev.args?.[2]) as string;
          const ts = BigInt((ev.args?.ts ?? ev.args?.[3]).toString());
          return { from, cid, ts };
        }).filter(Boolean) as Array<{ from: string; cid: string; ts: bigint }>;
        // newest first
        rows.sort((a, b) => Number(b.ts) - Number(a.ts));
        return rows;
      };
      let rows = await scan(fromWin, to);
      if (rows.length === 0) rows = await scan(0n, to);
      setGroupMessages(rows);
    } catch (e) {
      console.error('loadGroupMessages failed', e);
    } finally {
      setGroupLoading(false);
    }
  };

  // Reload messages when groupId changes
  useEffect(() => {
    if (groupId) loadGroupMessages();
  }, [groupId, contracts]);

  // Live subscription for GroupMessage for current group
  useEffect(() => {
    if (!contracts?.chats || !groupId) return;
    const handler = (gid: bigint, from: string, cid: string, ts: bigint) => {
      try {
        if (BigInt(gid as any) === BigInt(groupId)) {
          setGroupMessages(prev => [{ from, cid, ts: BigInt(ts as any) }, ...prev]);
        }
      } catch {}
    };
    const ch = contracts.chats;
    ch.on('GroupMessage', handler as any);
    return () => {
      try { ch.off('GroupMessage', handler as any); } catch {}
    };
  }, [contracts, groupId]);

  return (
    <div className="grid md:grid-cols-[320px,1fr] gap-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">My Chats</h2>
          <Button variant="secondary" onClick={loadSessions}>Refresh</Button>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder="0x peer address" value={newPeer} onChange={e=>setNewPeer(e.target.value)} />
            <Button onClick={create1to1}>New</Button>
          </div>
        </div>

        <div className="mt-4 space-y-2 max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader /> Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-gray-500">No sessions yet</div>
          ) : (
            sessions.map(s => {
              const other = s.a.toLowerCase() === address?.toLowerCase() ? s.b : s.a;
              return (
                <button key={s.id.toString()} onClick={()=>setActive(s.id)} className={`w-full text-left p-3 rounded-md border ${active===s.id? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">{truncateAddress(other)}</div>
                    <div className="text-xs text-gray-500">{formatDate(s.createdAt)}</div>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{s.lastCid || 'No messages yet'}</div>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-6">
          <h3 className="font-semibold mb-2">Groups</h3>
          <div className="space-y-2">
            <Input placeholder="Group name" value={groupName} onChange={e=>setGroupName(e.target.value)} />
            <Input placeholder="Members (comma addresses)" value={groupMembers} onChange={e=>setGroupMembers(e.target.value)} />
            <Button onClick={createGroup}>Create Group</Button>
          </div>
          <div className="mt-3 space-y-2">
            <Input placeholder="Group ID" value={groupId} onChange={e=>setGroupId(e.target.value)} />
            <Input placeholder="Member address" value={memberAddr} onChange={e=>setMemberAddr(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={addMember}>Add</Button>
              <Button variant="secondary" onClick={removeMember}>Remove</Button>
            </div>
            <Textarea placeholder="Group message (cid/text)" value={groupMsg} onChange={e=>setGroupMsg(e.target.value)} />
            <Button onClick={sendGroup}>Send to Group</Button>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500">My Groups</div>
              <Button variant="secondary" onClick={loadGroups}>Refresh</Button>
            </div>
            {groups.length === 0 ? (
              <div className="text-sm text-gray-500">No groups</div>
            ) : (
              <div className="space-y-1 max-h-[30vh] overflow-auto">
                {groups.map(g => (
                  <button key={g.id.toString()} className="w-full text-left p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent" onClick={()=>setGroupId(g.id.toString())}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{g.name || `Group #${g.id.toString()}`}</div>
                      <div className="text-xs text-gray-500">{g.id.toString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {groupId && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-500">Group Messages (ID {groupId})</div>
                <Button variant="secondary" onClick={loadGroupMessages} disabled={groupLoading}>{groupLoading ? 'Loading…' : 'Refresh'}</Button>
              </div>
              {groupMessages.length === 0 ? (
                <div className="text-sm text-gray-500">No messages</div>
              ) : (
                <div className="space-y-2 max-h-[30vh] overflow-auto">
                  {groupMessages.map((m, i) => (
                    <Card key={i}>
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-xs">{truncateAddress(m.from)}</div>
                        <div className="text-xs text-gray-500">{formatDate(m.ts)}</div>
                      </div>
                      <div className="mt-1 text-sm break-words whitespace-pre-wrap">{m.cid}</div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <div>
        {activeSession ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Active session</div>
                  <div className="font-mono">{truncateAddress(activeSession.a.toLowerCase()===address?.toLowerCase()? activeSession.b : activeSession.a)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={end} disabled={activeSession.closed}>End</Button>
                </div>
              </div>
            </Card>

            <div className="mt-4 space-y-3">
              <Card>
                <div className="text-sm text-gray-500 mb-2">Latest message (from chain lastCid)</div>
                <div className="whitespace-pre-wrap min-h-[120px] font-mono text-sm">{activeSession.lastCid || '—'}</div>
              </Card>

              <Card>
                <div className="space-y-2">
                  <Textarea placeholder="Type message (stored as cid string)" value={msg} onChange={e=>setMsg(e.target.value)} />
                  <div className="flex justify-end">
                    <Button onClick={send}>Send</Button>
                  </div>
                </div>
              </Card>
            </div>
          </motion.div>
        ) : (
          <Card>
            <div className="text-gray-500">Select or create a session</div>
          </Card>
        )}
      </div>
    </div>
  );
}
