import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useEthers } from '../hooks/useEthers';
import { useContracts } from '../hooks/useContracts';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Loader } from '../components/Loader';

export function Home() {
  const { address, connect, provider } = useEthers();
  const contracts = useContracts();

  const [checking, setChecking] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [foundAddr, setFoundAddr] = useState<string>('');
  const [rel, setRel] = useState<number>(0);
  const [searching, setSearching] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!contracts?.userRegistry || !address) return;
      setChecking(true);
      try {
        // Ensure contract exists at address on current network to prevent BAD_DATA
        const runnerProv: any = (contracts.userRegistry as any).runner?.provider || provider;
        const code = await runnerProv.getCode(contracts.userRegistry.target);
        if (!code || code === '0x') {
          setRegistered(null);
          return;
        }
        // Prefer getProfile.exists to determine registration and load data in one call
        const prof = await contracts.userRegistry.getProfile(address);
        if (prof?.exists) {
          setRegistered(true);
          setUsername(prof.username || '');
          setPubKey(prof.pubKey || '');
        } else {
          // Fallback: if exists flag not present, use isRegistered
          const exists = await contracts.userRegistry.isRegistered(address);
          setRegistered(!!exists);
          if (exists) {
            const p2 = await contracts.userRegistry.getProfile(address);
            setUsername(p2.username || '');
            setPubKey(p2.pubKey || '');
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [contracts, address, provider]);

  const doLookup = async () => {
    if (!contracts?.userRegistry || !searchUsername.trim()) return;
    setSearching(true);
    try {
      const addr: string = await contracts.userRegistry.addressOfUsername(searchUsername.trim());
      if (!addr || addr === '0x0000000000000000000000000000000000000000') {
        setFoundAddr('');
        setRel(0);
        return;
      }
      setFoundAddr(addr);
      if (address && contracts.friendSystem) {
        const r: number = await contracts.friendSystem.getRelation(address, addr);
        setRel(Number(r));
      }
    } catch (e) {
      setFoundAddr('');
      setRel(0);
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const sendReq = async () => {
    if (!contracts?.friendSystem || !foundAddr) return;
    setActing(true);
    try {
      const tx = await contracts.friendSystem.sendFriendRequest(foundAddr);
      await tx.wait();
      setRel(1);
    } catch (e: any) {
      alert(e?.message || 'Failed to send request');
    } finally {
      setActing(false);
    }
  };

  const accept = async () => {
    if (!contracts?.friendSystem || !foundAddr) return;
    setActing(true);
    try {
      const tx = await contracts.friendSystem.acceptFriendRequest(foundAddr);
      await tx.wait();
      setRel(3);
    } catch (e: any) {
      alert(e?.message || 'Failed to accept');
    } finally {
      setActing(false);
    }
  };

  const decline = async () => {
    if (!contracts?.friendSystem || !foundAddr) return;
    setActing(true);
    try {
      const tx = await contracts.friendSystem.declineFriendRequest(foundAddr);
      await tx.wait();
      setRel(0);
    } catch (e: any) {
      alert(e?.message || 'Failed to decline');
    } finally {
      setActing(false);
    }
  };

  const remove = async () => {
    if (!contracts?.friendSystem || !foundAddr) return;
    if (!confirm('Remove friend?')) return;
    setActing(true);
    try {
      const tx = await contracts.friendSystem.removeFriend(foundAddr);
      await tx.wait();
      setRel(0);
    } catch (e: any) {
      alert(e?.message || 'Failed to remove');
    } finally {
      setActing(false);
    }
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contracts?.userRegistry) return;
    setSubmitting(true);
    try {
      const tx = await contracts.userRegistry.register(username, pubKey || '');
      await tx.wait();
      setRegistered(true);
    } catch (err: any) {
      alert(err?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 items-center">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">MonSphere — Web3 Social Chat</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Decentralized 1:1 and group chats, forums, and friends — powered by smart contracts.
        </p>
        <div className="flex gap-3">
          {!address ? (
            <Button onClick={connect} size="lg">Connect Wallet</Button>
          ) : (
            <Button onClick={() => (window.location.href = '/chats')} size="lg">Go to Chats</Button>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Account</h2>
          {!address ? (
            <p className="text-gray-500">Connect your wallet to continue.</p>
          ) : checking ? (
            <div className="flex items-center gap-3"><Loader /> Checking registration…</div>
          ) : registered ? (
            <div className="space-y-4">
              <div className="text-green-600">You are registered. Explore Chats, Forums, Friends.</div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="font-medium mb-2">Find friends by username</div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input label="Username" placeholder="e.g. alice" value={searchUsername} onChange={e=>setSearchUsername(e.target.value)} />
                  </div>
                  <Button onClick={doLookup} disabled={!searchUsername.trim() || searching}>{searching ? 'Searching…' : 'Search'}</Button>
                </div>
                {foundAddr && (
                  <div className="mt-3 flex items-center justify-between p-3 rounded-md bg-gray-50 dark:bg-gray-800">
                    <div className="font-mono text-sm">{foundAddr}</div>
                    <div className="flex gap-2">
                      {rel === 0 ? (
                        <Button onClick={sendReq} disabled={acting}>Send Request</Button>
                      ) : rel === 1 ? (
                        <span className="text-sm text-gray-500">Request sent</span>
                      ) : rel === 2 ? (
                        <>
                          <Button onClick={accept} disabled={acting}>Accept</Button>
                          <Button variant="secondary" onClick={decline} disabled={acting}>Decline</Button>
                        </>
                      ) : (
                        <Button variant="danger" onClick={remove} disabled={acting}>Remove Friend</Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={onRegister} className="space-y-3">
              <Input label="Username" placeholder="e.g. satoshi" value={username} onChange={e=>setUsername(e.target.value)} required />
              <Input label="Public Key (optional)" placeholder="Your messaging public key" value={pubKey} onChange={e=>setPubKey(e.target.value)} />
              <Button type="submit" disabled={submitting || !username}>
                {submitting ? 'Registering…' : 'Register'}
              </Button>
            </form>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
