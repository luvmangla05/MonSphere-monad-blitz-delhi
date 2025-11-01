import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { useContracts } from '../hooks/useContracts';
import { formatDate, truncateAddress } from '../utils/formatters';
import { useEthers } from '../hooks/useEthers';

interface ForumInfo {
  id: bigint;
  title: string;
  creator: string;
  createdAt: bigint;
}

interface PostInfo {
  id: bigint;
  author: string;
  cid: string;
  ts: bigint;
  score: bigint;
}

interface CommentInfo {
  id: bigint;
  postId: bigint;
  author: string;
  cid: string;
  ts: bigint;
}

export function ForumDetail() {
  const { id } = useParams();
  const forumId = id ? BigInt(id) : null;
  const nav = useNavigate();
  const contracts = useContracts();
  const { address } = useEthers();

  const [info, setInfo] = useState<ForumInfo | null>(null);
  const [posts, setPosts] = useState<PostInfo[]>([]);
  const [newPost, setNewPost] = useState('');
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentInfo[]>>({});

  const loadForum = async () => {
    if (!contracts?.forums || forumId === null) return;
    try {
      const f = await contracts.forums.forums(forumId);
      setInfo({ id: forumId, title: f.title, creator: f.creator, createdAt: f.createdAt || BigInt(0) });
    } catch (e) { console.error(e); }
  };

  const loadPosts = async () => {
    if (!contracts?.forums || forumId === null) return;
    try {
      const ids: bigint[] = await contracts.forums.getPostsForForum(forumId);
      const list: PostInfo[] = [];
      for (const pid of ids) {
        const p = await contracts.forums.posts(pid);
        list.push({ id: pid, author: p.author, cid: p.cid, ts: p.ts, score: p.score });
      }
      list.sort((a,b)=>Number(b.ts)-Number(a.ts));
      setPosts(list);
      // load comments for each post
      for (const p of list) {
        await loadComments(p.id);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadForum(); loadPosts(); }, [contracts, id]);

  const createPost = async () => {
    if (!contracts?.forums || forumId===null || !newPost.trim()) return;
    try {
      const tx = await contracts.forums.createPost(forumId, newPost.trim());
      await tx.wait();
      setNewPost('');
      loadPosts();
    } catch (e: any) { alert(e?.message || 'Failed to post'); }
  };

  const vote = async (postId: bigint, v: number) => {
    if (!contracts?.forums) return;
    try {
      const tx = await contracts.forums.votePost(postId, v);
      await tx.wait();
      loadPosts();
    } catch (e: any) { alert(e?.message || 'Failed to vote'); }
  };

  const createComment = async (postId: bigint) => {
    if (!contracts?.forums) return;
    const text = (commentText[String(postId)] || '').trim();
    if (!text) return;
    try {
      const tx = await contracts.forums.createComment(postId, text);
      await tx.wait();
      setCommentText(prev => ({ ...prev, [String(postId)]: '' }));
      await loadComments(postId);
    } catch (e: any) { alert(e?.message || 'Failed to comment'); }
  };

  const deleteForum = async () => {
    if (!contracts?.forums || forumId===null) return;
    if (!confirm('Delete this forum?')) return;
    try {
      const tx = await contracts.forums.deleteForum(forumId);
      await tx.wait();
      nav('/forums');
    } catch (e: any) { alert(e?.message || 'Failed to delete'); }
  };

  const loadComments = async (postId: bigint) => {
    if (!contracts?.forums) return;
    try {
      const cids: bigint[] = await contracts.forums.getCommentsForPost(postId);
      const rows: CommentInfo[] = [];
      for (const cid of cids) {
        const c = await contracts.forums.comments(cid);
        rows.push({ id: cid, postId: postId, author: c.author, cid: c.cid, ts: c.ts });
      }
      rows.sort((a,b)=>Number(a.ts)-Number(b.ts));
      setCommentsByPost(prev => ({ ...prev, [String(postId)]: rows }));
    } catch (e) { console.error('loadComments failed', e); }
  };

  // Live updates for posts and comments on this forum
  useEffect(() => {
    if (!contracts?.forums || forumId===null) return;
    const onPostCreated = (postId: bigint, forumIdEv: bigint) => {
      try {
        if (BigInt(forumIdEv as any) === forumId) loadPosts();
      } catch {}
    };
    const onPostVoted = () => { loadPosts(); };
    const onCommentCreated = (commentId: bigint, postId: bigint) => {
      try { loadComments(BigInt(postId as any)); } catch {}
    };
    const f = contracts.forums as any;
    f.on('PostCreated', onPostCreated);
    f.on('PostVoted', onPostVoted);
    f.on('CommentCreated', onCommentCreated);
    return () => {
      try {
        f.off('PostCreated', onPostCreated);
        f.off('PostVoted', onPostVoted);
        f.off('CommentCreated', onCommentCreated);
      } catch {}
    };
  }, [contracts, forumId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={()=>nav('/forums')}>← Back</Button>
        <h1 className="text-2xl font-bold">Forum {info?.title || `#${id}`}</h1>
        <div className="w-20"></div>
      </div>

      {info && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              By {truncateAddress(info.creator)} · {formatDate(info.createdAt)}
            </div>
            {info.creator?.toLowerCase?.() === address?.toLowerCase?.() && (
              <Button variant="danger" onClick={deleteForum}>Delete</Button>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-2">
          <Textarea placeholder="New post content (cid/text)" value={newPost} onChange={e=>setNewPost(e.target.value)} />
          <div className="flex justify-end">
            <Button onClick={createPost} disabled={!newPost.trim()}>Post</Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {posts.map(p => (
          <Card key={p.id.toString()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {truncateAddress(p.author)} · {formatDate(p.ts)}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Button variant="secondary" onClick={()=>vote(p.id, 1)}>▲</Button>
                <span className="w-8 text-center">{p.score.toString()}</span>
                <Button variant="secondary" onClick={()=>vote(p.id, -1)}>▼</Button>
              </div>
            </div>
            <div className="whitespace-pre-wrap mb-3">{p.cid}</div>
            {commentsByPost[String(p.id)] && commentsByPost[String(p.id)].length > 0 && (
              <div className="space-y-2 mb-3">
                {commentsByPost[String(p.id)].map(c => (
                  <Card key={c.id.toString()} className="bg-gray-50 dark:bg-gray-900">
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {truncateAddress(c.author)} · {formatDate(c.ts)}
                    </div>
                    <div className="mt-1 text-sm whitespace-pre-wrap">{c.cid}</div>
                  </Card>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Write a comment" value={commentText[String(p.id)]||''} onChange={e=>setCommentText(prev=>({...prev,[String(p.id)]:e.target.value}))} className="flex-1" />
                <Button onClick={()=>createComment(p.id)} disabled={!commentText[String(p.id)]?.trim()}>Reply</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
