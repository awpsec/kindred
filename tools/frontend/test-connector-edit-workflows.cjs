const { chromium, webkit } = require(process.env.KINDRED_PLAYWRIGHT_MODULE || 'playwright');
const { server, token } = require('./fixtures/desktop.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser = await (process.env.WEBKIT ? webkit : chromium).launch(
    process.env.WEBKIT ? { headless: true } : { headless: true },
  );
  const cards = [
    { id: 'outlook-draft', bot_id: 'piper', kind: 'email', connection: 'Outlook', connector: 'outlook', source: 'Kindred', tool: 'outlook__send_email', title: 'Schedule review', email_send: true, status: 'pending', revision: 4, input: { message: { subject: 'Schedule review', body: { contentType: 'HTML', content: '<p>Please confirm.</p>' }, toRecipients: [{ emailAddress: { address: 'jordan@example.invalid' } }], attachments: [{ id: 'att-1', name: 'agenda.pdf', contentBytes: 'secret-binary' }] } }, email: { to: { key: '/message/toRecipients', text: 'jordan@example.invalid', array: true, editable: true }, subject: { key: '/message/subject', text: 'Schedule review', editable: true }, body: { key: '/message/body/content', text: 'Please confirm.', format: 'html', editable: true } }, records: [] },
    { id: 'task-draft', bot_id: 'piper', kind: 'task', connection: 'Asana', connector: 'asana', source: 'Kindred', tool: 'asana__update_task', title: 'Confirm owners', status: 'pending', revision: 2, input: { name: 'Confirm owners', notes: 'Ask the team.' }, edit_fields: { name: { key: 'name', label: 'Task name', text: 'Confirm owners', type: 'text', editable: true }, notes: { key: 'notes', label: 'Notes', text: 'Ask the team.', type: 'textarea', editable: true } }, records: [] },
    { id: 'calendar-draft', bot_id: 'piper', kind: 'calendar', connection: 'Google Calendar', connector: 'gcal', source: 'Kindred', tool: 'gcal__update_event', title: 'Launch sync', status: 'pending', revision: 1, input: { summary: 'Launch sync' }, edit_fields: { summary: { key: 'summary', label: 'Event title', text: 'Launch sync', type: 'text', editable: true } }, records: [] },
    { id: 'message-draft', bot_id: 'piper', kind: 'message', connection: 'Slack', connector: 'slack', source: 'Kindred', tool: 'slack__send_message', title: 'Launch update', status: 'pending', revision: 1, input: { text: 'Launch update' }, edit_fields: { text: { key: 'text', label: 'Message', text: 'Launch update', type: 'textarea', editable: true } }, records: [] },
    { id: 'history-task', bot_id: 'piper', kind: 'task', connection: 'Trello', connector: 'trello', source: 'Kindred', tool: 'trello__get_card', title: 'Past task', status: 'completed', revision: 3, records: [{ title: 'Past task', fields: { Status: 'done' } }] },
    { id: 'failed-task', bot_id: 'piper', kind: 'task', connection: 'Asana', connector: 'asana', source: 'Kindred', tool: 'asana__update_task', title: 'Failed task', status: 'failed', revision: 3, records: [], input: {} },
  ];
  const actions = [];
  let heldSave, releaseSave;
  cards.push({id:'pending-read',bot_id:'piper',kind:'task',connection:'Asana',connector:'asana',source:'Codex',tool:'get_task',title:'Read task',status:'pending',revision:1,input:{name:'Query name'},read_only:true,forced:true,edit_fields:{},records:[]});
  const messages = () => cards.map((connector_artifact, i) => ({ seq: i + 1, sender: 'piper', kind: 'connector_artifact', text: connector_artifact.title, run_id: 'run-screenshot', created: 1789050000 + i, connector_artifact }));
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await context.addInitScript(t => sessionStorage.setItem('kindred-token', t), token);
    await context.route(origin + '/api/chats/dm-piper*', r => r.fulfill({ json: { chat: { id: 'dm-piper', name: 'Piper', members: ['piper'] }, messages: messages(), page: { has_before: false, has_after: false } } }));
    await context.route(origin + '/api/connector-artifacts/*', async r => {
      const body = r.request().postDataJSON(); actions.push(body);
      const card = cards.find(c => r.request().url().endsWith(encodeURIComponent(c.id)));
      assert(card);
      assert.equal(body.revision, card.revision);
      if (heldSave && body.action === 'edit') await heldSave;
      if (body.action === 'edit' && card.id === 'outlook-draft' && actions.filter(a => a.action === 'edit').length === 1) return r.fulfill({ status: 409, json: { error: 'The current draft changed. Review it again.' } });
      if (body.action === 'edit') {
        for (const [key, value] of Object.entries(body.fields)) {
          if (card.id === 'outlook-draft') {
            if (key === 'body') card.input.message.body.content = value;
            if (key === 'subject') card.input.message.subject = value;
            if (key === 'to') card.input.message.toRecipients = [{ emailAddress: { address: value } }];
            if (card.email[key]) card.email[key].text = value;
          } else { card.input[key] = value; if (card.edit_fields?.[key]) card.edit_fields[key].text = value; }
        }
        card.title = card.input.message?.subject || card.input.subject || card.input.title || card.input.name || card.input.summary || card.title;
        card.edited_by_user = true; card.revision++;
      }
      if (body.action === 'approve') { card.status = 'executing'; card.revision++; }
      return r.fulfill({ json: card });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    const email = page.locator('[data-connector-artifact="outlook-draft"]');
    await email.getByRole('button', { name: 'Edit draft' }).click();
    const editor = email.getByRole('form', { name: 'Edit email draft' });
    await editor.getByLabel('Message').press('Escape');
    assert.equal(await email.getByRole('button',{name:'Edit draft'}).evaluate(n=>n===document.activeElement),true,'Escape restores focus to Edit draft');
    await email.getByRole('button',{name:'Edit draft'}).click();
    await editor.getByRole('button',{name:'Cancel editing'}).click();
    assert.equal(await email.getByRole('button',{name:'Edit draft'}).evaluate(n=>n===document.activeElement),true,'Cancel restores focus to Edit draft');
    await email.getByRole('button',{name:'Edit draft'}).click();
    await editor.getByLabel('Message').fill('Updated <b>schedule</b>.');
    assert.equal(await email.getByRole('button', { name: 'Approve & send' }).isDisabled(), true);
    await email.getByText('Sending permissions', { exact: true }).click();
    assert.equal(await email.getByRole('button', { name: /allow future/i }).isDisabled(), true);
    await email.getByText('Attachments and related fields', { exact: true }).click();
    assert((await email.innerText()).includes('agenda.pdf'));
    assert(!(await email.innerText()).includes('secret-binary'));
    await editor.getByRole('button', { name: 'Save draft changes' }).click();
    await editor.getByRole('alert').waitFor();
    assert.equal(await editor.getByLabel('Message').inputValue(), 'Updated <b>schedule</b>.');
    await editor.getByRole('button', { name: 'Save draft changes' }).click();
    await email.getByText('Includes your saved edits').waitFor();
    assert.equal(actions.filter(a => a.action === 'edit')[1].fields.body, 'Updated <b>schedule</b>.');
    await email.locator('.connector-email-body').getByText('Updated schedule.', {exact:true}).waitFor();
    await page.reload();
    await email.getByText('Includes your saved edits').waitFor();
    assert((await email.locator('.connector-email-body').innerText()).includes('Updated schedule.'));
    await email.getByRole('button', {name:'Edit draft'}).click();
    await editor.getByLabel('Subject').fill('Unsaved change');
    await editor.getByRole('button', {name:'Cancel editing'}).click();
    assert.equal(await email.locator('.connector-card-editor').count(), 0);
    assert.equal(await email.getByRole('button', {name:'Approve & send'}).isDisabled(), false);
    assert.equal(await email.evaluate(n=>n.classList.contains('connector-editing')), false);
    assert.equal(await email.getByRole('heading', {name:'Schedule review',exact:true}).count(), 1);
    await email.getByRole('button', {name:'Edit draft'}).click();
    await editor.getByLabel('Subject').fill('A pending save');
    heldSave = new Promise(resolve => { releaseSave=resolve; });
    const beforeSave = actions.length;
    await editor.evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    await page.waitForFunction(()=>document.querySelector('[data-connector-artifact="outlook-draft"] .connector-card-editor button').disabled);
    await editor.getByLabel('Subject').press('Escape');
    assert.equal(await email.locator('.connector-card-editor').count(), 1);
    assert.equal(await email.getByRole('button',{name:'Approve & send'}).isDisabled(), true);
    releaseSave(); heldSave = null;
    await email.getByRole('heading', {name:'A pending save', exact:true}).waitFor();
    assert.equal(actions.length-beforeSave, 1, 'Double submission must save only once');
    assert.equal(await page.locator('[data-connector-artifact="pending-read"]').getByRole('button', {name:'Edit fields'}).count(), 0);

    const task = page.locator('[data-connector-artifact="task-draft"]');
    await task.getByRole('button', { name: 'Edit fields' }).click();
    const taskEditor = task.getByRole('form', { name: 'Edit connector fields' });
    await taskEditor.getByLabel('Notes').fill('Updated notes.'); await taskEditor.getByRole('button', { name: 'Save field changes' }).click();
    await task.getByText('Includes your saved edits').waitFor();
    assert.equal(await task.getByRole('button', { name: 'Approve action' }).isDisabled(), false);
    await task.getByRole('button', { name: 'Approve action' }).click();
    const taskCall=page.locator('.connector-call').filter({has:task});await taskCall.locator('summary').filter({hasText:'Calling'}).waitFor();await taskCall.locator('summary').click();await task.getByText('In progress').waitFor();
    for (const [id, label, value] of [['calendar-draft', 'Event title', 'Rescheduled sync'], ['message-draft', 'Message', 'Updated launch update']]) {
      const card = page.locator(`[data-connector-artifact="${id}"]`); await card.getByRole('button', { name: 'Edit fields' }).click();
      const form = card.getByRole('form', { name: 'Edit connector fields' }); await form.getByLabel(label).fill(value); await form.getByRole('button', { name: 'Save field changes' }).click(); await card.getByText('Includes your saved edits').waitFor();
    }
    assert.equal(await task.getByRole('button', { name: 'Edit fields' }).count(), 0);
    assert.equal(await page.locator('[data-connector-artifact="history-task"] .connector-card-editor').count(), 0);
    assert((await page.locator('[data-connector-artifact="failed-task"]').innerText()).includes('external state is unconfirmed'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const artifacts = process.env.KINDRED_TEST_ARTIFACTS || path.resolve(__dirname, '../../test-results/connector-edit-workflows'); fs.mkdirSync(artifacts, { recursive: true });
    await email.screenshot({ path: path.join(artifacts, (process.env.WEBKIT?'webkit':'chromium')+'-outlook-saved-mobile.png') });
    await page.setViewportSize({width:1200,height:900});
    await page.locator('[data-connector-artifact="calendar-draft"]').screenshot({path:path.join(artifacts,(process.env.WEBKIT?'webkit':'chromium')+'-calendar-saved.png')});
    await email.getByRole('button',{name:'Chat about this',exact:true}).click();
    await email.getByLabel('What would you like changed?').fill('Please confirm the recipient.');
    assert.equal(await email.getByRole('button',{name:'Approve & send'}).isDisabled(),true);
    await email.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await email.getByRole('button',{name:'Approve & send'}).isDisabled(),false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, engine: process.env.WEBKIT ? 'webkit' : 'chromium', outlookNestedMetadata: true, genericTaskEditor: true, errorPreservesDraft: true, cancelRestoresApproval: true, doubleSaveOnce: true, inFlightEscapeGuard: true, savedReload: true, feedbackGuardsApproval: true, historyReadOnly: true, failedOutcome: true }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
