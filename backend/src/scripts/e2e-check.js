import fs from 'node:fs/promises';

const base = 'http://localhost:3000';

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@sorhaugconsulting.no',
    password: 'TestPassord123!'
  })
});

const loginJson = await loginRes.json();
if (!loginRes.ok) {
  throw new Error(`Login feilet: ${JSON.stringify(loginJson)}`);
}

const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
const csrf = loginJson.csrfToken;

const suffix = Date.now();
const userEmail = `kunde.${suffix}@sorhaugconsulting.no`;

const userRes = await fetch(`${base}/api/admin/users`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-csrf-token': csrf,
    cookie
  },
  body: JSON.stringify({
    name: 'Kunde Test',
    email: userEmail,
    password: 'SterktPassord456!',
    role: 'client'
  })
});

if (!userRes.ok) {
  throw new Error(`Brukeropprettelse feilet: ${await userRes.text()}`);
}

const projectRes = await fetch(`${base}/api/admin/projects`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-csrf-token': csrf,
    cookie
  },
  body: JSON.stringify({
    name: `Prosjekt ${suffix}`,
    description: 'Automatisk testprosjekt',
    memberEmails: [userEmail]
  })
});

const projectJson = await projectRes.json();
if (!projectRes.ok) {
  throw new Error(`Prosjektopprettelse feilet: ${JSON.stringify(projectJson)}`);
}

const projectId = projectJson.project.id;
const buffer = await fs.readFile('protected/sample-rapport.txt');
const form = new FormData();
form.append('title', 'Test-rapport');
form.append('kind', 'rapport');
form.append('file', new Blob([buffer], { type: 'text/plain' }), 'sample-rapport.txt');

const uploadRes = await fetch(`${base}/api/admin/projects/${projectId}/assets`, {
  method: 'POST',
  headers: {
    'x-csrf-token': csrf,
    cookie
  },
  body: form
});

const uploadJson = await uploadRes.json();
if (!uploadRes.ok) {
  throw new Error(`Filopplasting feilet: ${JSON.stringify(uploadJson)}`);
}

const assetsRes = await fetch(`${base}/api/projects/${projectId}/assets`, {
  headers: { cookie }
});

const assetsJson = await assetsRes.json();
if (!assetsRes.ok) {
  throw new Error(`Asset-listing feilet: ${JSON.stringify(assetsJson)}`);
}

const blockedRes = await fetch(`${base}/api/admin/projects`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie
  },
  body: JSON.stringify({
    name: 'CSRF skal feile',
    description: '',
    memberEmails: []
  })
});

const blockedJson = await blockedRes.json();

console.log(
  JSON.stringify(
    {
      loginOk: loginRes.ok,
      projectId,
      assetCount: (assetsJson.assets || []).length,
      uploadAsset: uploadJson.asset?.fileName,
      csrfBlockedStatus: blockedRes.status,
      csrfBlockedMessage: blockedJson.message
    },
    null,
    2
  )
);
