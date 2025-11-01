import { useEffect, useMemo, useState } from 'react';
import { useEthers } from '../hooks/useEthers';
import { useContracts } from '../hooks/useContracts';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { truncateAddress } from '../utils/formatters';

// FriendSystem.RequestStatus: 0 NONE, 1 SENT, 2 RECEIVED, 3 FRIENDS
const STATUS = { NONE: 0, SENT: 1, RECEIVED: 2, FRIENDS: 3 } as const;

export function Friends() {
  const { address, provider } = useEthers();
  const contracts = useContracts();

  const [username, setUsername] = useState('');
  const [found, setFound] = useState<string>('');
  const [relation, setRelation] = useState<number>(STATUS.NONE);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [incoming, setIncoming] = useState<string[]>([]);
  const [outgoing, setOutgoing] = useState<string[]>([]);
  const [friends, setFriends] = useState<string[]>([]);

  const friendSystem = contracts?.friendSystem;
  const my = (address || '').toLowerCase();

  const fetchRequests = useMemo(() => {
    return async () => {
      if (!friendSystem || !address) return;
      try {
        const latest = await (friendSystem.runner?.provider as any).getBlockNumber();
        const scan = async (from: bigint, to: bigint) => {
          const sentToMe = await friendSystem.queryFilter(friendSystem.filters.FriendRequestSent(null, address), from, to);
          const sentByMe = await friendSystem.queryFilter(friendSystem.filters.FriendRequestSent(address, null), from, to);
          const accToMe = await friendSystem.queryFilter(friendSystem.filters.FriendRequestAccepted(null, address), from, to);
          const accByMe = await friendSystem.queryFilter(friendSystem.filters.FriendRequestAccepted(address, null), from, to);
          const remMine = await friendSystem.queryFilter(friendSystem.filters.FriendRemoved(address), from, to);
          const remOther = await friendSystem.queryFilter(friendSystem.filters.FriendRemoved(null, address), from, to);

          const candidates = new Set<string>();
          sentToMe.forEach((ev: any) => candidates.add((ev.args?.from as string).toLowerCase()));
          sentByMe.forEach((ev: any) => candidates.add((ev.args?.to as string).toLowerCase()));
          accToMe.forEach((ev: any) => candidates.add((ev.args?.from as string).toLowerCase()));
          accByMe.forEach((ev: any) => candidates.add((ev.args?.to as string).toLowerCase()));
          remMine.forEach((ev: any) => candidates.add((ev.args?.exFriend as string).toLowerCase()));
          remOther.forEach((ev: any) => candidates.add((ev.args?.user as string).toLowerCase()));
          return candidates;
        };

        // First try a recent window
        const window = 500000n;
        const to: bigint = BigInt(latest);
        const fromWin: bigint = to > window ? (to - window) : 0n;
        let candidates = await scan(fromWin, to);

        // If nothing found, perform full-range fallback
        if (candidates.size === 0) {
          candidates = await scan(0n, to);
        }

        const inc: string[] = [];
        const out: string[] = [];
        const fr: string[] = [];
        for (const a of candidates) {
          if (!a || a === my) continue;
          try {
            const rel: number = await friendSystem.getRelation(address, a);
            if (Number(rel) === STATUS.RECEIVED) inc.push(a);
            else if (Number(rel) === STATUS.SENT) out.push(a);
            else if (Number(rel) === STATUS.FRIENDS) fr.push(a);
          } catch {}
        }

        // Ensure currently selected user is reflected if FRIENDS
        if (found) {
          try {
            const relNow: number = await friendSystem.getRelation(address, found);
            if (Number(relNow) === STATUS.FRIENDS) {
              const f = found.toLowerCase();
              if (!fr.includes(f)) fr.push(f);
            }
          } catch {}
        }

        setIncoming(inc);
        setOutgoing(out);
        setFriends(fr);
      } catch (e) {
        console.error('fetchRequests failed', e);
      }
    };
  }, [friendSystem, address, my, found]);

  useEffect(() => {
    if (!friendSystem) return;
    const onSent = async (from: string, to: string) => {
      if (from?.toLowerCase?.() === my || to?.toLowerCase?.() === my) await fetchRequests();
    };
    const onAccepted = async (from: string, to: string) => {
      if (from?.toLowerCase?.() === my || to?.toLowerCase?.() === my) await fetchRequests();
    };
    const onDeclined = async (from: string, to: string) => {
      if (from?.toLowerCase?.() === my || to?.toLowerCase?.() === my) await fetchRequests();
    };
    const onRemoved = async (user: string, exFriend: string) => {
      if (user?.toLowerCase?.() === my || exFriend?.toLowerCase?.() === my) await fetchRequests();
    };

    friendSystem.on('FriendRequestSent', onSent);
    friendSystem.on('FriendRequestAccepted', onAccepted);
    friendSystem.on('FriendRequestDeclined', onDeclined);
    friendSystem.on('FriendRemoved', onRemoved);

    return () => {
      friendSystem.off('FriendRequestSent', onSent);
      friendSystem.off('FriendRequestAccepted', onAccepted);
      friendSystem.off('FriendRequestDeclined', onDeclined);
      friendSystem.off('FriendRemoved', onRemoved);
    };
  }, [friendSystem, my, fetchRequests]);

  // Initial load and on dependency change
  useEffect(() => {
    if (friendSystem && address) {
      fetchRequests();
    }
  }, [friendSystem, address, fetchRequests]);

  const doLookup = async () => {
    if (!contracts?.userRegistry || !username.trim()) return;
    setLoading(true);
    try {
      const addr: string = await contracts.userRegistry.addressOfUsername(username.trim());
      if (!addr || addr === '0x0000000000000000000000000000000000000000') {
        setFound('');
        setRelation(STATUS.NONE);
        return;
      }
      setFound(addr);
      if (address && contracts.friendSystem) {
        const rel: number = await contracts.friendSystem.getRelation(address, addr);
        setRelation(Number(rel));
      }
    } catch (e) {
      setFound('');
      setRelation(STATUS.NONE);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async () => {
    if (!contracts?.friendSystem || !found) return;
    setActionLoading(true);
    try {
      const tx = await contracts.friendSystem.sendFriendRequest(found);
      await tx.wait();
      setRelation(STATUS.SENT);
    } catch (e: any) {
      alert(e?.message || 'Failed to send request');
    } finally {
      setActionLoading(false);
    }
  };

  const accept = async () => {
    if (!contracts?.friendSystem || !found) return;
    setActionLoading(true);
    try {
      const tx = await contracts.friendSystem.acceptFriendRequest(found);
      await tx.wait();
      setRelation(STATUS.FRIENDS);
    } catch (e: any) {
      alert(e?.message || 'Failed to accept');
    } finally {
      setActionLoading(false);
    }
  };

  const decline = async () => {
    if (!contracts?.friendSystem || !found) return;
    setActionLoading(true);
    try {
      const tx = await contracts.friendSystem.declineFriendRequest(found);
      await tx.wait();
      setRelation(STATUS.NONE);
    } catch (e: any) {
      alert(e?.message || 'Failed to decline');
    } finally {
      setActionLoading(false);
    }
  };

  const remove = async () => {
    if (!contracts?.friendSystem || !found) return;
    if (!confirm('Remove this friend?')) return;
    setActionLoading(true);
    try {
      const tx = await contracts.friendSystem.removeFriend(found);
      await tx.wait();
      setRelation(STATUS.NONE);
    } catch (e: any) {
      alert(e?.message || 'Failed to remove');
    } finally {
      setActionLoading(false);
    }
  };

  const removeAt = async (addr: string) => {
    if (!contracts?.friendSystem) return;
    if (!confirm('Remove this friend?')) return;
    try {
      const tx = await contracts.friendSystem.removeFriend(addr);
      await tx.wait();
      fetchRequests();
    } catch (e: any) {
      alert(e?.message || 'Failed to remove');
    }
  };

  const isSelf = found && address && found.toLowerCase() === address.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Friends</h1>
        <Button variant="secondary" onClick={() => fetchRequests()}>Refresh</Button>
      </div>

      <Card>
        <div className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="Search by username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. satoshi" />
            </div>
            <Button onClick={doLookup} disabled={!username.trim() || loading}>{loading ? 'Searching…' : 'Search'}</Button>
          </div>

          {found ? (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">User</div>
                  <div className="font-mono">{truncateAddress(found)}{isSelf && ' (you)'}</div>
                </div>
                <div className="flex gap-2">
                  {isSelf ? (
                    <span className="text-gray-500 text-sm">This is you</span>
                  ) : relation === STATUS.NONE ? (
                    <Button onClick={sendRequest} disabled={actionLoading}>Send Request</Button>
                  ) : relation === STATUS.SENT ? (
                    <span className="text-sm text-gray-500">Request sent</span>
                  ) : relation === STATUS.RECEIVED ? (
                    <><Button onClick={accept} disabled={actionLoading}>Accept</Button>
                      <Button variant="secondary" onClick={decline} disabled={actionLoading}>Decline</Button>
                    </>
                  ) : (
                    <Button variant="danger" onClick={remove} disabled={actionLoading}>Remove Friend</Button>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <div className="text-sm text-gray-500">No user selected</div>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-4 hidden">
        <Card>
          <div className="font-semibold mb-2">Friends</div>
          {friends.length === 0 ? (
            <div className="text-sm text-gray-500">None</div>
          ) : (
            <div className="space-y-2">
              {friends.map((a) => (
                <div key={a} className="flex items-center justify-between">
                  <div className="font-mono text-sm">{truncateAddress(a)}</div>
                  <Button size="sm" variant="danger" onClick={() => removeAt(a)}>Remove</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="font-semibold mb-2">Incoming Requests</div>
          {incoming.length === 0 ? (
            <div className="text-sm text-gray-500">None</div>
          ) : (
            <div className="space-y-2">
              {incoming.map((a) => (
                <div key={a} className="flex items-center justify-between">
                  <div className="font-mono text-sm">{truncateAddress(a)}</div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setFound(a); setRelation(STATUS.RECEIVED); accept(); }}>Accept</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setFound(a); setRelation(STATUS.RECEIVED); decline(); }}>Decline</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="font-semibold mb-2">Outgoing Requests</div>
          {outgoing.length === 0 ? (
            <div className="text-sm text-gray-500">None</div>
          ) : (
            <div className="space-y-2">
              {outgoing.map((a) => (
                <div key={a} className="flex items-center justify-between">
                  <div className="font-mono text-sm">{truncateAddress(a)}</div>
                  <span className="text-xs text-gray-500">Pending…</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
