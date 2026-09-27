
const baseUrl = 'http://localhost:8080/api';

export function adaptBackendSession(s) {
  const [clientIp, clientPort] = String(s.client || ':').split(':')
  const [serverIp, serverPort] = String(s.server || ':').split(':')
  return {
    ...s,
    tcp_stream: s.stream,
    client: { ip: clientIp, port: parseInt(clientPort) },
    server: { ip: serverIp, port: parseInt(serverPort) },
    tls_version: s.tlsVersion,
    cipher_suite: s.cipherSuite,
    kex: s.keyExchange,
    cert_subject: s.certSubject,
  }
}

function adaptBackendCapture(detail) {
  if (detail.report) return { ...detail.report, investigation_id: detail.investigationId,
    sessions: detail.report.sessions.map(s => ({ ...s, backendId: detail.sessions?.find(row => row.stream === s.tcp_stream)?.id })) }
  return {
    investigation_id: detail.investigationId,
    sessions: (detail.sessions || []).map(adaptBackendSession),
  }
}

async function run() {
  const login = await fetch(baseUrl + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'forensics', password: 'password' })
  });
  const { token } = await login.json();
  const capRes = await fetch(baseUrl + '/captures', { headers: { 'Authorization': 'Bearer ' + token } });
  const caps = await capRes.json();
  const id = caps[0].id;
  const detRes = await fetch(baseUrl + '/captures/' + id, { headers: { 'Authorization': 'Bearer ' + token } });
  const detail = await detRes.json();
  
  try {
    const adapted = adaptBackendCapture(detail);
    console.log('Adapt success!', adapted.sessions.length);
  } catch (err) {
    console.log('Adapt Error:', err);
  }
}
run();

