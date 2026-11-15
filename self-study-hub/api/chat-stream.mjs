export const config = {
    runtime: 'edge',
};

function escapeHTML(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            },
        });
    }

    const url = new URL(req.url);
    const peerId = url.searchParams.get('peerId');
    const token = url.searchParams.get('token');

    if (!peerId || !token) {
        return new Response('Missing peerId or token', { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return new Response('Server misconfigured: Missing Supabase secrets', { status: 500 });
    }

    const authHeaders = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
    };

    // 1. Verify the caller's JWT token with Supabase Auth
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${token}`,
        },
    });

    if (!userRes.ok) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userData = await userRes.json();
    const currentUserId = userData.id;

    // 2. Verify caller is an Admin or Moderator
    const [adminCheck, modCheck] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/admins?user_id=eq.${currentUserId}&select=user_id`, { headers: authHeaders }),
        fetch(`${supabaseUrl}/rest/v1/moderators?user_id=eq.${currentUserId}&select=user_id`, { headers: authHeaders }),
    ]);

    const admins = await adminCheck.json();
    const mods = await modCheck.json();

    if ((!Array.isArray(admins) || admins.length === 0) && (!Array.isArray(mods) || mods.length === 0)) {
        return new Response('Forbidden: Staff access only', { status: 403 });
    }

    // 3. Stream dynamic HTML chunks for the staff chat thread
    const encoder = new TextEncoder();
    let lastTimestamp = new Date(0).toISOString();
    let isClosed = false;

    req.signal?.addEventListener('abort', () => {
        isClosed = true;
    });

    const stream = new ReadableStream({
        async start(controller) {
            const sendChunk = (htmlChunk) => {
                if (!isClosed) {
                    controller.enqueue(encoder.encode(htmlChunk + '\n'));
                }
            };

            // Send initial stream marker
            sendChunk('<!-- STREAM_CONNECTED -->');

            const pollMessages = async () => {
                if (isClosed) return;

                try {
                    const filter = `or=(and(sender_id.eq.${currentUserId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${currentUserId}))`;
                    const queryUrl = `${supabaseUrl}/rest/v1/messages?${filter}&created_at=gt.${encodeURIComponent(lastTimestamp)}&order=created_at.asc`;

                    const msgRes = await fetch(queryUrl, { headers: authHeaders });
                    if (msgRes.ok) {
                        const messages = await msgRes.json();
                        if (Array.isArray(messages) && messages.length > 0) {
                            let htmlBatch = '';
                            for (const m of messages) {
                                lastTimestamp = m.created_at;
                                const isMe = m.sender_id === currentUserId;
                                htmlBatch += `<div class="flex ${isMe ? 'justify-end' : 'justify-start'}" data-msg-id="${escapeHTML(m.id)}"><div class="max-w-xs px-3 py-2 rounded-xl text-xs ${isMe ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}">${escapeHTML(m.content)}</div></div>`;
                            }
                            sendChunk(htmlBatch);
                        }
                    }
                } catch (err) {
                    sendChunk(`<!-- STREAM_ERROR: ${escapeHTML(err.message)} -->`);
                }
            };

            // Initial load
            await pollMessages();

            // Keep Edge stream open and push new HTML chunks every 2 seconds (up to 45s per connection)
            const interval = setInterval(async () => {
                if (isClosed) {
                    clearInterval(interval);
                    return;
                }
                await pollMessages();
            }, 2000);

            setTimeout(() => {
                clearInterval(interval);
                if (!isClosed) {
                    isClosed = true;
                    controller.close();
                }
            }, 45000);
        },
        cancel() {
            isClosed = true;
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}