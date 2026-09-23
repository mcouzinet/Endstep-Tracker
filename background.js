// Toolbar click: bring back the dashboard tab if one is already open, otherwise open it.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('dashboard.html');
  const open = (await chrome.runtime.getContexts({ contextTypes: ['TAB'] })).find((c) => (c.documentUrl || '').startsWith(url));
  if (!open) return chrome.tabs.create({ url });
  await chrome.tabs.update(open.tabId, { active: true });
  await chrome.windows.update(open.windowId, { focused: true });
});

// Reloading or updating the extension kills its content scripts in open Endstep tabs (Chrome only injects them on
// page load). Put them back: hook.js keeps running in the page and replays what the tab missed to the new content.js.
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({ url: 'https://endstep.cc/*' })) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['hook.js'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['tracker.js', 'content.js'] });
    } catch (e) {
      console.warn('[endstep-tracker] could not re-attach to tab', tab.id, e);
    }
  }
});

// "REC" badge on the Endstep tab while a match is being tracked.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#b3261e' });
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.live ? 'REC' : '' });
});
