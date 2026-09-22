// Toolbar click: bring back the dashboard tab if one is already open, otherwise open it.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('dashboard.html');
  const open = (await chrome.runtime.getContexts({ contextTypes: ['TAB'] })).find((c) => (c.documentUrl || '').startsWith(url));
  if (!open) return chrome.tabs.create({ url });
  await chrome.tabs.update(open.tabId, { active: true });
  await chrome.windows.update(open.windowId, { focused: true });
});

// "REC" badge on the Endstep tab while a match is being tracked.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#b3261e' });
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.live ? 'REC' : '' });
});
